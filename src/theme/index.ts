import { useColorScheme } from 'react-native';

const palette = {
  // Verde institucional y acentos cálidos.
  primary: '#0B6E4F',
  primaryDark: '#08533B',
  accent: '#F2A541',
  danger: '#C0392B',
  success: '#2E8B57',
  warning: '#D68910',
};

export const lightColors = {
  ...palette,
  background: '#F5F7F6',
  surface: '#FFFFFF',
  surfaceAlt: '#E8F1ED',
  text: '#1B2420',
  textMuted: '#5D6B65',
  border: '#D5DED9',
  userBubble: '#0B6E4F',
  userBubbleText: '#FFFFFF',
  botBubble: '#FFFFFF',
  botBubbleText: '#1B2420',
};

export type Colors = typeof lightColors;

export const darkColors: Colors = {
  ...palette,
  primary: '#3FB68B',
  background: '#0F1512',
  surface: '#18211D',
  surfaceAlt: '#1F2D27',
  text: '#E6EDE9',
  textMuted: '#9AABA3',
  border: '#2B3A33',
  userBubble: '#2E8B6A',
  userBubbleText: '#FFFFFF',
  botBubble: '#18211D',
  botBubbleText: '#E6EDE9',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 12, lg: 18 } as const;

export function useTheme() {
  const dark = useColorScheme() === 'dark';
  return { colors: dark ? darkColors : lightColors, dark };
}
