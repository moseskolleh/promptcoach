// Impact — personal dashboard: today / week / all-time totals rendered as
// the relatable weekly sentence + stat cards, 7-day bar chart, grade streak.
//
// TODO(implementation):
//  - storage.getHistory() → engine.aggregate per period
//  - relatable.forTotals(totals, 'this week') headline sentence
//  - Weekly local notification recap (expo-notifications)

import React from 'react';
import { ScrollView, Text } from 'react-native';

export default function ImpactScreen() {
  return (
    <ScrollView>
      <Text>Impact — to be implemented</Text>
    </ScrollView>
  );
}
