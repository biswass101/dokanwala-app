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

const mockNetInfoState = {
  isConnected: true as boolean | null,
  isInternetReachable: true as boolean | null,
  type: 'wifi',
};
const mockNetInfoListeners = new Set<(state: typeof mockNetInfoState) => void>();

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  },
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  Stack: {
    Screen: () => null,
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(async () => ({ ...mockNetInfoState })),
    addEventListener: jest.fn((listener: (state: typeof mockNetInfoState) => void) => {
      mockNetInfoListeners.add(listener);
      listener({ ...mockNetInfoState });
      return () => {
        mockNetInfoListeners.delete(listener);
      };
    }),
    __setMockState: (partial: Partial<typeof mockNetInfoState>) => {
      Object.assign(mockNetInfoState, partial);
      const snapshot = { ...mockNetInfoState };
      for (const listener of Array.from(mockNetInfoListeners)) {
        listener(snapshot);
      }
    },
    __resetMockState: () => {
      mockNetInfoState.isConnected = true;
      mockNetInfoState.isInternetReachable = true;
      mockNetInfoState.type = 'wifi';
      mockNetInfoListeners.clear();
    },
  },
}));

jest.mock('expo-file-system', () => {
  const mockFileData = new Map<string, string | Uint8Array>();
  class MockFile {
    public readonly uri: string;
    public readonly name: string;
    constructor(...uris: Array<string | { uri: string }>) {
      const joined = uris
        .map((u) => (typeof u === 'string' ? u : u.uri))
        .join('/')
        .replace(/\/+/g, '/');
      this.uri = joined.startsWith('file://') ? joined : `file://${joined}`;
      this.name = joined.split('/').pop() ?? 'mock-file';
    }
    get exists(): boolean {
      return mockFileData.has(this.uri);
    }
    create(): void {
      mockFileData.set(this.uri, '');
    }
    delete(): void {
      mockFileData.delete(this.uri);
    }
    async write(content: string | Uint8Array): Promise<void> {
      mockFileData.set(this.uri, content);
    }
    async text(): Promise<string> {
      const raw = mockFileData.get(this.uri);
      if (typeof raw === 'string') return raw;
      if (raw instanceof Uint8Array) return Buffer.from(raw).toString('utf8');
      return '';
    }
    static pickFileAsync = jest.fn(async () => ({ canceled: true, result: null }));
  }
  return {
    File: MockFile,
    Paths: { cache: { uri: 'file:///mock-cache' }, document: { uri: 'file:///mock-docs' } },
  };
});

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-print', () => ({
  printAsync: jest.fn(async () => undefined),
  printToFileAsync: jest.fn(async () => ({ uri: 'file:///mock-cache/print.pdf' })),
}));
