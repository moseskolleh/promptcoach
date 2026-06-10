// Bottom-tab navigation: Coach · Compare · Impact · Library · Settings.
// Structure only — icons and options to be filled in during implementation.

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import CoachScreen from '../screens/CoachScreen';
import CompareScreen from '../screens/CompareScreen';
import ImpactScreen from '../screens/ImpactScreen';
import LibraryScreen from '../screens/LibraryScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();

export default function RootNavigator() {
  return (
    <Tab.Navigator initialRouteName="Coach">
      <Tab.Screen name="Coach" component={CoachScreen} />
      <Tab.Screen name="Compare" component={CompareScreen} />
      <Tab.Screen name="Impact" component={ImpactScreen} />
      <Tab.Screen name="Library" component={LibraryScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
