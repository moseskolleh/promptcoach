// Share-sheet / deep-link intake — the mobile app's key differentiator:
// share a draft prompt from ANY app (incl. ChatGPT/Claude/Gemini apps) into
// EcoPrompt Coach for a pre-flight impact check.
//
// Implementation plan:
//  - iOS: Share Extension target (expo-share-intent or config plugin)
//  - Android: ACTION_SEND intent filter for text/plain
//  - Both route into the deep link  ecoprompt://coach?text=...
//
// TODO(implementation): wire expo-share-intent and parse initial URL.

export interface SharedPrompt {
  text: string;
  sourceApp?: string;
}

export async function getInitialSharedPrompt(): Promise<SharedPrompt | null> {
  // TODO: read initial share intent / deep link (Linking.getInitialURL).
  return null;
}

export function subscribeToSharedPrompts(
  _onPrompt: (prompt: SharedPrompt) => void
): () => void {
  // TODO: Linking.addEventListener('url', ...) → parse → onPrompt.
  return () => {};
}
