export const theme = {
  colors: {
    turquoise: '#00C2B3',
    deepBlue: '#0D2B45',
    lightGray: '#F1F4F6',
    mediumGray: '#A8B1BA',
    white: '#FFFFFF',
    dangerRed: '#FF6B6B',
    amber: '#FFB020',
  },
  fontFamily: 'Inter',
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 24,
    '2xl': 28,
    '3xl': 32,
    '4xl': 40,
    '5xl': 48,
  },
  fontWeight: {
    normal: '400' as const,
    medium: '500' as const,
    bold: '700' as const,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    '2xl': 48,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    full: 9999,
    inputRadius: 8,
    buttonRadius: 12,
  },
  dimensions: {
    buttonHeight: 48,
    buttonCTAHeight: 56,
    inputHeight: 48,
    navbarHeight: 56,
    screenWidth: 375,
    tabBarHeight: 68,
  },
};

export type Theme = typeof theme;
