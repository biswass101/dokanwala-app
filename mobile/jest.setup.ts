import '@/i18n';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));
