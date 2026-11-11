import '@/i18n';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

const mockSecureMap = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureMap.set(key, value);
  }),
  getItemAsync: jest.fn(async (key: string) => mockSecureMap.get(key) ?? null),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureMap.delete(key);
  }),
}));

jest.mock('expo-crypto', () => {
  const nodeCrypto = require('node:crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA256' },
    randomUUID: () => nodeCrypto.randomUUID(),
    getRandomBytesAsync: async (byteCount: number) =>
      new Uint8Array(nodeCrypto.randomBytes(byteCount)),
    digestStringAsync: async (_alg: string, data: string) =>
      nodeCrypto.createHash('sha256').update(data).digest('hex'),
  };
});

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));
