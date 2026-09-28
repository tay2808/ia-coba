import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { radius, spacing, useTheme } from '../theme';

export function Screen({ children, scroll = true, style }: { children: React.ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  if (!scroll) {
    return <View style={[styles.screen, { backgroundColor: colors.background }, style]}>{children}</View>;
  }
  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.screenContent, style]}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const { colors } = useTheme();
  const content = <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>;
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <Text style={[styles.title, { color: colors.text }]}>{children}</Text>;
}

export function Body({ children, muted, style }: { children: React.ReactNode; muted?: boolean; style?: object }) {
  const { colors } = useTheme();
  return <Text style={[styles.body, { color: muted ? colors.textMuted : colors.text }, style]}>{children}</Text>;
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const bg = { primary: colors.primary, secondary: colors.surfaceAlt, danger: colors.danger, ghost: 'transparent' }[variant];
  const fg = variant === 'primary' || variant === 'danger' ? '#FFFFFF' : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        variant === 'ghost' && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function Input(props: TextInputProps) {
  const { colors } = useTheme();
  return (
    <TextInput
      placeholderTextColor={colors.textMuted}
      {...props}
      style={[
        styles.input,
        { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
        props.multiline && { minHeight: 120, textAlignVertical: 'top' },
        props.style,
      ]}
    />
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.surface },
      ]}>
      <Text style={{ color: selected ? '#FFFFFF' : colors.text, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}>
      <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${Math.max(0, Math.min(1, value)) * 100}%` }]} />
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Empty({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Body muted>{text}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenContent: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  card: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: spacing.lg, gap: spacing.sm },
  title: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21 },
  button: { borderRadius: radius.sm, paddingVertical: 12, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: radius.sm, padding: spacing.md, fontSize: 15 },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  empty: { padding: spacing.xl, alignItems: 'center' },
});
