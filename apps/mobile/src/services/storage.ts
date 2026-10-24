// AsyncStorage persistence — history, library, settings.
// Shapes mirror the Chrome extension's storage records so a future account
// sync can merge data from both surfaces.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_MODEL_ID, migrateModelId } from './engine';

export interface HistoryEntry {
  ts: number;
  source: 'share' | 'manual' | 'clipboard';
  modelId: string;
  energyWh: number;
  waterMl: number;
  carbonG: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'E';
  /** An estimate's range (PLAN.md Step 8); a null highWh is a floor. */
  lowWh?: number;
  highWh?: number | null;
}

export interface LibraryEntry {
  id: string;
  title: string;
  text: string;
  modelId: string;
  tokens: number;
  energyWh: number;
  grade: string;
  /** An estimate's range, as the web library saves it. */
  range?: { lowWh: number; highWh: number | null; rangeOnly: boolean; method: string | null };
  ts: number;
}

export interface Settings {
  defaultModelId: string;
  regionKey: string;
  reasoningEffort: 'low' | 'standard' | 'high';
  includeEmbodied: boolean;
}

const KEYS = { history: 'eco_history', library: 'epc_library', settings: 'eco_settings' };
const HISTORY_CAP = 5000;

export async function appendHistory(entry: HistoryEntry): Promise<void> {
  const history = await getHistory();
  history.push(entry);
  await AsyncStorage.setItem(KEYS.history, JSON.stringify(history.slice(-HISTORY_CAP)));
}

export async function getHistory(): Promise<HistoryEntry[]> {
  const raw = await AsyncStorage.getItem(KEYS.history);
  return raw ? JSON.parse(raw) : [];
}

export async function getLibrary(): Promise<LibraryEntry[]> {
  const raw = await AsyncStorage.getItem(KEYS.library);
  return raw ? JSON.parse(raw) : [];
}

export async function saveLibraryEntry(entry: LibraryEntry): Promise<void> {
  const library = await getLibrary();
  await AsyncStorage.setItem(KEYS.library, JSON.stringify([entry, ...library]));
}

const DEFAULT_SETTINGS: Settings = {
  defaultModelId: DEFAULT_MODEL_ID,
  regionKey: 'default',
  reasoningEffort: 'standard',
  includeEmbodied: true
};

export async function getSettings(): Promise<Settings> {
  const raw = await AsyncStorage.getItem(KEYS.settings);
  const saved: Partial<Settings> = raw ? JSON.parse(raw) : {};
  // A saved model that is no longer current follows its superseded_by chain
  // to a current one (PLAN.md Step 7); the move is written back once.
  const move = migrateModelId(saved.defaultModelId);
  const settings: Settings = { ...DEFAULT_SETTINGS, ...saved, defaultModelId: move.modelId };
  if (move.changed) await setSettings(settings);
  return settings;
}

export async function setSettings(settings: Settings): Promise<void> {
  await AsyncStorage.setItem(KEYS.settings, JSON.stringify(settings));
}
