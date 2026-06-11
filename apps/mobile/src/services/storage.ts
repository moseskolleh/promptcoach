// AsyncStorage persistence — history, library, settings.
// Shapes mirror the Chrome extension's storage records so a future account
// sync can merge data from both surfaces.

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface HistoryEntry {
  ts: number;
  source: 'share' | 'manual' | 'clipboard';
  modelId: string;
  energyWh: number;
  waterMl: number;
  carbonG: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'E';
}

export interface LibraryEntry {
  id: string;
  title: string;
  text: string;
  modelId: string;
  tokens: number;
  energyWh: number;
  grade: string;
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

export async function getSettings(): Promise<Settings> {
  const raw = await AsyncStorage.getItem(KEYS.settings);
  return raw
    ? JSON.parse(raw)
    : { defaultModelId: 'gpt-5', regionKey: 'default', reasoningEffort: 'standard', includeEmbodied: true };
}

export async function setSettings(settings: Settings): Promise<void> {
  await AsyncStorage.setItem(KEYS.settings, JSON.stringify(settings));
}
