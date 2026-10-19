// A–E eco-grade badge, colored per theme.colors.grades. An estimate passes
// describeImpact's gradeText ("B–E", "≥ C") with gradeLow as `grade`.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

export default function GradeBadge({ grade, text }: { grade: string; text?: string }) {
  const label = text ?? grade;
  return (
    <View style={[styles.badge, { backgroundColor: colors.grades[grade] ?? colors.muted }]}>
      <Text style={[styles.letter, label.length > 1 && styles.span]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 44,
    paddingHorizontal: 6,
    height: 44,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center'
  },
  letter: { color: '#fff', fontSize: 24, fontWeight: '800' },
  span: { fontSize: 17 }
});
