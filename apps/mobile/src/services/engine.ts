// Singleton wrapper around the shared calculation engine (@ecoprompt/core).
// The core is dependency-free CommonJS, so Metro bundles it as-is — the
// mobile app uses EXACTLY the same math and data as the extension and web app.

// @ts-expect-error — core ships untyped CommonJS; typings TODO in packages/core
import * as core from '@ecoprompt/core';

export type ReasoningEffort = 'low' | 'standard' | 'high';

export interface ImpactRequest {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  options?: {
    taskMultiplier?: number;
    reasoningEffort?: ReasoningEffort;
    regionKey?: string;
  };
}

const { engine, converters } = core.createDefaultEngine();

export const listModels = () => engine.listModels();
export const listRegions = () => engine.listRegions();
export const estimateImpact = (req: ImpactRequest) => engine.estimateImpact(req);
export const compareModels = (req: {
  modelIds: string[];
  inputTokens: number;
  outputTokens: number;
}) => engine.compareModels(req);
export const aggregate = (impacts: unknown[]) => engine.aggregate(impacts);

export const analyzePrompt = (text: string) => core.analyzePrompt(text);
export const generateOptimizedPrompt = (text: string) => core.generateOptimizedPrompt(text);
export const relatable = converters; // .forImpact(impact), .forTotals(totals, label)
