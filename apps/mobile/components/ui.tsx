import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Modal as RNModal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const C = {
  brand: '#1d7871', brandDark: '#0f4c47', brandSoft: '#e6f4f2',
  ink: '#0f172a', soft: '#475569', muted: '#94a3b8', line: '#e2e8f0', bg: '#f6f8f8', white: '#fff',
  red: '#dc2626', redSoft: '#fee2e2', amber: '#b45309', amberSoft: '#fef3c7', green: '#047857', greenSoft: '#d1fae5', blue: '#1d4ed8', blueSoft: '#dbeafe',
};
export type Tone = 'green' | 'red' | 'amber' | 'blue' | 'gray';
const TONES: Record<Tone, [string, string]> = {
  green: [C.green, C.greenSoft], red: [C.red, C.redSoft], amber: [C.amber, C.amberSoft], blue: [C.blue, C.blueSoft], gray: [C.soft, '#f1f5f9'],
};
export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Screen({ children, onRefresh, refreshing, padded = true }: { children: ReactNode; onRefresh?: () => void; refreshing?: boolean; padded?: boolean }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={padded ? { padding: 16, gap: 12, paddingBottom: 40 } : undefined}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.brand} colors={[C.brand]} /> : undefined}>
      {children}
    </ScrollView>
  );
}

export function Card({ children, title, right, style }: { children?: ReactNode; title?: string; right?: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[s.card, style]}>
      {(title || right) && <View style={s.cardHead}><Text style={s.cardTitle}>{title}</Text>{right}</View>}
      {children}
    </View>
  );
}

export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: Tone }) {
  const [fg, bg] = TONES[tone];
  return <View style={[s.badge, { backgroundColor: bg }]}><Text style={[s.badgeText, { color: fg }]}>{children}</Text></View>;
}

export function Button({ title, onPress, variant = 'primary', icon, disabled, loading, small }: { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; icon?: IconName; disabled?: boolean; loading?: boolean; small?: boolean }) {
  const bg = variant === 'primary' ? C.brand : variant === 'danger' ? C.red : variant === 'ghost' ? 'transparent' : C.white;
  const fg = variant === 'primary' || variant === 'danger' ? C.white : C.brandDark;
  return (
    <Pressable accessibilityRole="button" disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => [s.btn, small && s.btnSmall, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }, variant === 'secondary' && { borderWidth: 1, borderColor: C.line }]}>
      {loading ? <ActivityIndicator color={fg} /> : <>
        {icon && <Ionicons name={icon} size={small ? 15 : 18} color={fg} />}
        <Text style={[s.btnText, small && { fontSize: 13 }, { color: fg }]}>{title}</Text>
      </>}
    </Pressable>
  );
}

export function Input({ label, ...props }: TextInputProps & { label?: string }) {
  return (
    <View style={{ gap: 4 }}>
      {label && <Text style={s.label}>{label}</Text>}
      <TextInput placeholderTextColor={C.muted} {...props} style={[s.input, props.multiline && { minHeight: 90, textAlignVertical: 'top' }, props.style]} />
    </View>
  );
}

export function Stat({ label, value, tone, icon }: { label: string; value: ReactNode; tone?: Tone; icon?: IconName }) {
  const color = tone ? TONES[tone][0] : C.ink;
  return (
    <View style={s.stat}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon && <Ionicons name={icon} size={14} color={C.muted} />}
        <Text style={s.statLabel} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[s.statValue, { color }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export function Row({ title, subtitle, right, onPress, icon }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [s.row, pressed && onPress && { backgroundColor: '#f8fafc' }]}>
      {icon && <View style={s.rowIcon}><Ionicons name={icon} size={18} color={C.brand} /></View>}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.rowTitle} numberOfLines={2}>{title}</Text>
        {subtitle ? <Text style={s.rowSub} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right}
      {onPress && !right && <Ionicons name="chevron-forward" size={18} color={C.muted} />}
    </Pressable>
  );
}

export function Empty({ text, icon = 'file-tray-outline' }: { text: string; icon?: IconName }) {
  return <View style={s.empty}><Ionicons name={icon} size={28} color={C.muted} /><Text style={{ color: C.soft, textAlign: 'center' }}>{text}</Text></View>;
}

export function Loading() {
  return <View style={s.empty}><ActivityIndicator color={C.brand} /></View>;
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return <Card><Text style={{ color: C.red }}>{error}</Text>{onRetry && <View style={{ marginTop: 8 }}><Button small variant="secondary" title="Tentar novamente" onPress={onRetry} /></View>}</Card>;
}

export function Chips<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.chip, value === o.value && s.chipOn]}>
          <Text style={[s.chipText, value === o.value && { color: C.white }]}>{o.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <RNModal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={[s.sheet, { paddingBottom: 16 + insets.bottom }]}>
        <View style={s.cardHead}>
          <Text style={[s.cardTitle, { fontSize: 17 }]}>{title}</Text>
          <Pressable accessibilityLabel="Fechar" onPress={onClose} hitSlop={10}><Ionicons name="close" size={22} color={C.soft} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: 12, padding: 16 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </RNModal>
  );
}

export const s = StyleSheet.create({
  card: { backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: C.ink },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 16 },
  btnSmall: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8 },
  btnText: { fontSize: 15, fontWeight: '600' },
  label: { fontSize: 13, color: C.soft, fontWeight: '500' },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: C.ink, backgroundColor: C.white },
  stat: { flexBasis: '47%', flexGrow: 1, backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 14, gap: 6 },
  statLabel: { fontSize: 12, color: C.soft },
  statValue: { fontSize: 22, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  rowIcon: { width: 34, height: 34, borderRadius: 9, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, color: C.ink, fontWeight: '500' },
  rowSub: { fontSize: 13, color: C.soft },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 28 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.white, paddingHorizontal: 14, paddingVertical: 7 },
  chipOn: { backgroundColor: C.brand, borderColor: C.brand },
  chipText: { fontSize: 13, color: C.soft, fontWeight: '500' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)' },
  sheet: { backgroundColor: C.white, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '88%' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  muted: { color: C.soft, fontSize: 13 },
  h1: { fontSize: 22, fontWeight: '700', color: C.ink },
});
