// Shared design tokens — keep in sync with apps/web/styles.css and the
// extension popup. One brand across every surface.

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
  grades: {
    A: '#10B981',
    B: '#84CC16',
    C: '#F59E0B',
    D: '#F97316',
    E: '#EF4444'
  } as Record<string, string>
};

export const spacing = (n: number) => n * 8;

export const radius = { card: 12, pill: 999 };
