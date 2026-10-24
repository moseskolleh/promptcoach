// Singleton wrapper around the shared calculation engine (@ecoprompt/core).
// The core is dependency-free CommonJS, so Metro bundles it as-is — the
// mobile app uses EXACTLY the same math and data as the extension and web app.

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
export const aggregate = (impacts: Parameters<typeof engine.aggregate>[0]) => engine.aggregate(impacts);

// The one default model, and how a saved one is brought up to date
// (PLAN.md Step 7).
export const DEFAULT_MODEL_ID = core.DEFAULT_MODEL_ID;
export const migrateModelId = (modelId: string | null | undefined) => engine.migrateModelId(modelId);

export const analyzePrompt = (text: string) => core.analyzePrompt(text);
export const generateOptimizedPrompt = (text: string) => core.generateOptimizedPrompt(text);
export const relatable = converters; // .forImpact(impact), .forTotals(totals, label)
// How to label an estimate (range, method chip, grade range), and which
// savings its range allows (PLAN.md Step 8).
export const describeImpact = core.describeImpact;
export const savingClaim = core.savingClaim;
