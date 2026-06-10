// A–E eco-grade letter badge, colored per theme.colors.grades.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

export default function GradeBadge({ grade }: { grade: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: colors.grades[grade] ?? colors.muted }]}>
      <Text style={styles.letter}>{grade}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 44,
    height: 44,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center'
  },
  letter: { color: '#fff', fontSize: 24, fontWeight: '800' }
});
