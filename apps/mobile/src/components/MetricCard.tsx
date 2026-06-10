// One impact metric: relatable line first ("4 minutes of an LED bulb"),
// technical figure second ("0.42 Wh") — never the other way around.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../theme';

interface Props {
  icon: string; // emoji: ⚡ 💧 🌍
  primary: string;
  secondary: string;
}

export default function MetricCard({ icon, primary, secondary }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.icon}>{icon}</Text>
      <View style={styles.body}>
        <Text style={styles.primary}>{primary}</Text>
        <Text style={styles.secondary}>{secondary}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing(2),
    gap: spacing(1.5)
  },
  icon: { fontSize: 24 },
  body: { flex: 1 },
  primary: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  secondary: { color: colors.muted, fontSize: 13 }
});
