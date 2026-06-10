// Coach — the core flow: type/paste/share a prompt, see live impact in
// relatable units, get coaching tips, copy the trimmed prompt.
//
// TODO(implementation):
//  - TextInput (multiline) with debounced analyzePrompt()
//  - Model picker (grouped by provider, grade dots) + region from settings
//  - GradeBadge + 3× MetricCard (relatable.forImpact)
//  - TipCard list; "Copy trimmed prompt" via generateOptimizedPrompt + Clipboard
//  - "Save to library" → storage.saveLibraryEntry
//  - Consume shareTarget.getInitialSharedPrompt() on mount

import React from 'react';
import { ScrollView, Text } from 'react-native';

export default function CoachScreen() {
  return (
    <ScrollView>
      <Text>Coach — to be implemented (see TODOs in this file)</Text>
    </ScrollView>
  );
}
