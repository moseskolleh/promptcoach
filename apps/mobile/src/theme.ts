// Shared design tokens — keep in sync with apps/web/styles.css and the
// extension popup. One brand across every surface. The grade palette comes
// from the core, as on every surface (PLAN.md Step 13).

import { GRADE_COLORS } from '@ecoprompt/core';

export const colors = {
  primary: '#10B981',
  primaryDark: '#064E3B',
  ink: '#0F172A',
  muted: '#64748B',
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  amber: '#F59E0B',
  danger: '#EF4444',
  blue: '#3B82F6',
  grades: GRADE_COLORS as Record<string, string>
};

export const spacing = (n: number) => n * 8;

export const radius = { card: 12, pill: 999 };
