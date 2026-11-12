/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0F766E',
          pressed: '#115E59',
          soft: '#CCFBF1',
        },
        surface: '#FFFFFF',
        background: '#F8FAFC',
        border: '#E2E8F0',
        textPrimary: '#0F172A',
        textSecondary: '#475569',
        success: {
          DEFAULT: '#15803D',
          soft: '#DCFCE7',
        },
        warning: {
          DEFAULT: '#B45309',
          soft: '#FEF3C7',
        },
        danger: {
          DEFAULT: '#B91C1C',
          soft: '#FEE2E2',
        },
      },
      fontFamily: {
        bengali: ['NotoSansBengali_400Regular'],
        'bengali-medium': ['NotoSansBengali_500Medium'],
        'bengali-semibold': ['NotoSansBengali_600SemiBold'],
        'bengali-bold': ['NotoSansBengali_700Bold'],
        sans: ['Inter_400Regular'],
      },
    },
  },
  plugins: [],
};
