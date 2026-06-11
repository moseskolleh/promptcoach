// Coaching tip with priority accent bar (critical/high → amber/danger).

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../theme';

interface Props {
  title: string;
  description: string;
  impact: string;
  priority: 'critical' | 'high' | 'medium';
}

const ACCENT = { critical: colors.danger, high: colors.amber, medium: colors.blue };

export default function TipCard({ title, description, impact, priority }: Props) {
  return (
    <View style={[styles.card, { borderLeftColor: ACCENT[priority] }]}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <Text style={styles.impact}>{impact}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderLeftWidth: 4,
    padding: spacing(2),
    gap: spacing(0.5)
  },
  title: { color: colors.ink, fontWeight: '700' },
  description: { color: colors.muted, fontSize: 13 },
  impact: { color: colors.primary, fontSize: 13, fontWeight: '600' }
});
