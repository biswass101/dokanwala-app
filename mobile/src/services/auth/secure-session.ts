import { normalizePinInput } from '@dokanwala/shared';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY_ACCESS_TOKEN = 'dokanwala_access_token';
const KEY_REFRESH_TOKEN = 'dokanwala_refresh_token';
const KEY_DEVICE_ID = 'dokanwala_device_id';
const KEY_PIN_VERIFIER = 'dokanwala_pin_verifier';
const KEY_PIN_ATTEMPTS = 'dokanwala_pin_attempts';
const KEY_PIN_LOCKED_UNTIL = 'dokanwala_pin_locked_until';

const MAX_OFFLINE_PIN_ATTEMPTS = 5;
const MAX_OFFLINE_PIN_WIPE_ATTEMPTS = 10;
const OFFLINE_LOCKOUT_MS = 15 * 60 * 1000;
const PIN_HASH_ROUNDS = 500;

interface StoredPinVerifier {
  userId: string;
  saltHex: string;
  digestHex: string;
}

const webMemoryStore = new Map<string, string>();

async function setSecureItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    webMemoryStore.set(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

async function getSecureItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return webMemoryStore.get(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

async function deleteSecureItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    webMemoryStore.delete(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function derivePinDigest(userId: string, saltHex: string, pin: string): Promise<string> {
  const normalizedPin = normalizePinInput(pin);
  let current = `${saltHex}:${userId}:${normalizedPin}`;
  for (let i = 0; i < PIN_HASH_ROUNDS; i += 1) {
    current = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, current);
  }
  return current;
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await getSecureItem(KEY_DEVICE_ID);
  if (existing) {
    return existing;
  }
  const newId = Crypto.randomUUID();
  await setSecureItem(KEY_DEVICE_ID, newId);
  return newId;
}

export async function saveAuthTokens(accessToken: string, refreshToken: string): Promise<void> {
  await setSecureItem(KEY_ACCESS_TOKEN, accessToken);
  await setSecureItem(KEY_REFRESH_TOKEN, refreshToken);
}

export async function getStoredAccessToken(): Promise<string | null> {
  return getSecureItem(KEY_ACCESS_TOKEN);
}

export async function getStoredRefreshToken(): Promise<string | null> {
  return getSecureItem(KEY_REFRESH_TOKEN);
}

export async function saveOfflinePinVerifier(userId: string, plainPin: string): Promise<void> {
  const saltBytes = await Crypto.getRandomBytesAsync(16);
  const saltHex = bytesToHex(saltBytes);
  const digestHex = await derivePinDigest(userId, saltHex, plainPin);
  const payload: StoredPinVerifier = { userId, saltHex, digestHex };
  await setSecureItem(KEY_PIN_VERIFIER, JSON.stringify(payload));
  await setSecureItem(KEY_PIN_ATTEMPTS, '0');
  await deleteSecureItem(KEY_PIN_LOCKED_UNTIL);
}

export async function hasOfflinePinVerifier(userId?: string): Promise<boolean> {
  const raw = await getSecureItem(KEY_PIN_VERIFIER);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredPinVerifier>;
    if (!parsed.userId || !parsed.saltHex || !parsed.digestHex) return false;
    return userId ? parsed.userId === userId : true;
  } catch {
    return false;
  }
}

export async function clearOfflinePinVerifier(): Promise<void> {
  await deleteSecureItem(KEY_PIN_VERIFIER);
  await deleteSecureItem(KEY_PIN_ATTEMPTS);
  await deleteSecureItem(KEY_PIN_LOCKED_UNTIL);
}

export type OfflinePinVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_CONFIGURED' | 'INVALID_PIN' | 'LOCKED' | 'WIPED'; lockedUntilMs?: number; remainingAttempts?: number };

export async function verifyOfflinePin(
  userId: string,
  plainPin: string,
): Promise<OfflinePinVerifyResult> {
  const lockedUntilRaw = await getSecureItem(KEY_PIN_LOCKED_UNTIL);
  if (lockedUntilRaw) {
    const lockedUntilMs = Number(lockedUntilRaw);
    if (Number.isFinite(lockedUntilMs) && lockedUntilMs > Date.now()) {
      return { ok: false, reason: 'LOCKED', lockedUntilMs };
    }
  }

  const rawVerifier = await getSecureItem(KEY_PIN_VERIFIER);
  if (!rawVerifier) {
    return { ok: false, reason: 'NOT_CONFIGURED' };
  }

  let parsed: StoredPinVerifier;
  try {
    parsed = JSON.parse(rawVerifier) as StoredPinVerifier;
  } catch {
    return { ok: false, reason: 'NOT_CONFIGURED' };
  }

  if (parsed.userId !== userId) {
    return { ok: false, reason: 'NOT_CONFIGURED' };
  }

  const candidateDigest = await derivePinDigest(userId, parsed.saltHex, plainPin);
  if (constantTimeEquals(candidateDigest, parsed.digestHex)) {
    await setSecureItem(KEY_PIN_ATTEMPTS, '0');
    await deleteSecureItem(KEY_PIN_LOCKED_UNTIL);
    return { ok: true };
  }

  const prevAttempts = Number((await getSecureItem(KEY_PIN_ATTEMPTS)) ?? '0');
  const nextAttempts = (Number.isFinite(prevAttempts) ? prevAttempts : 0) + 1;
  await setSecureItem(KEY_PIN_ATTEMPTS, String(nextAttempts));

  if (nextAttempts >= MAX_OFFLINE_PIN_WIPE_ATTEMPTS) {
    await clearSecureAuthSession();
    return { ok: false, reason: 'WIPED' };
  }

  if (nextAttempts % MAX_OFFLINE_PIN_ATTEMPTS === 0) {
    const lockedUntilMs = Date.now() + OFFLINE_LOCKOUT_MS;
    await setSecureItem(KEY_PIN_LOCKED_UNTIL, String(lockedUntilMs));
    return { ok: false, reason: 'LOCKED', lockedUntilMs };
  }

  return {
    ok: false,
    reason: 'INVALID_PIN',
    remainingAttempts: MAX_OFFLINE_PIN_ATTEMPTS - (nextAttempts % MAX_OFFLINE_PIN_ATTEMPTS),
  };
}

export async function clearSecureAuthSession(): Promise<void> {
  await deleteSecureItem(KEY_ACCESS_TOKEN);
  await deleteSecureItem(KEY_REFRESH_TOKEN);
  await clearOfflinePinVerifier();
}
