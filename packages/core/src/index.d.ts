// Type declarations for @ecoprompt/core. Hand-written; the runtime is plain
// CommonJS with no build step (see index.js). Keep in sync when the engine's
// public surface changes — the analyzer/engine tests exercise every export.

export type Grade = 'A' | 'B' | 'C' | 'D' | 'E';
export type ReasoningEffort = 'low' | 'standard' | 'high';
export type QueryCategory = 'short' | 'medium' | 'long';
export type DataSource = 'measured' | 'extrapolated' | 'anchored';

// ----------------------------------------------------------------- data files

export interface BenchPoint {
  input_tokens: number;
  output_tokens: number;
  energy_wh_mean: number;
  energy_wh_std?: number;
}

export interface ProviderAnchor {
  energy_wh?: number;
  water_ml?: number;
  carbon_g?: number;
  /** What the provider's figure covers; anchors with a wider boundary than the engine are not reproduced by it. */
  boundary?: string;
  label?: string;
}

export interface ModelEntry {
  model_id: string;
  name: string;
  provider: string;
  host: string;
  host_key?: string;
  size_class?: string;
  data_source?: DataSource;
  is_reasoning?: boolean;
  provider_reported_anchor?: ProviderAnchor;
  performance: { short: BenchPoint; medium: BenchPoint; long: BenchPoint };
}

export interface ModelsData {
  _metadata?: Record<string, unknown>;
  models: ModelEntry[];
}

export interface ProviderGrid {
  name: string;
  pue: number;
  wue_onsite_l_per_kwh: number;
  wue_offsite_l_per_kwh: number;
  cif_kgco2e_per_kwh: number;
  notes?: string;
  source?: string;
}

export interface GridsData {
  _metadata?: Record<string, unknown>;
  lifecycle?: { embodied_factor: number; notes?: string };
  providers: Record<string, ProviderGrid>;
  regions?: Record<string, { name: string; cif_kgco2e_per_kwh: number }>;
}

export interface EquivalentsData {
  _metadata?: Record<string, unknown>;
  factors: Record<string, number>;
}

// -------------------------------------------------------------------- engine

export interface Coefficients {
  /** Wh per input token (prefill). */
  eIn: number;
  /** Wh per output token (decode). */
  eOut: number;
  /** Wh per request (fixed overhead; for reasoning models includes hidden thinking). */
  eFixed: number;
  /** Energy-weighted relative uncertainty of the benchmark points, 0.05–0.6. */
  relStd: number;
}

export interface ModelSummary {
  id: string;
  name: string;
  provider: string;
  host: string;
  sizeClass?: string;
  dataSource: DataSource | string;
  isReasoning: boolean;
}

export interface ModelRecord extends ModelSummary {
  hostKey: string;
  anchor: ProviderAnchor | null;
  bench: BenchPoint[];
  benchMaxInput: number;
  benchMaxOutput: number;
  coefficients: Coefficients;
}

export interface ImpactOptions {
  /** Task-type energy multiplier (image ×3, agentic ×2, …); non-positive values are treated as 1. */
  taskMultiplier?: number;
  /** Reasoning models only; unknown keys fall back to 'standard'. */
  reasoningEffort?: ReasoningEffort | string;
  /** Override the carbon grid (regions in grids.json); energy and water are unaffected. */
  regionKey?: string;
  /** Direct carbon-intensity override in kgCO2e/kWh. */
  cifOverride?: number;
  /** Include the lifecycle (embodied) uplift on carbon. Default true. */
  includeEmbodied?: boolean;
}

export interface ImpactRequest {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  options?: ImpactOptions;
}

export interface GradeResult {
  grade: Grade;
  /** 0–100, log-scaled: 0.05 Wh ≈ 100, 30 Wh ≈ 0. */
  score: number;
}

export interface Impact {
  model: ModelSummary;
  tokens: { input: number; output: number; total: number };
  category: QueryCategory;
  energy: {
    wh: number;
    kwh: number;
    breakdown: { fixedWh: number; inputWh: number; outputWh: number };
    perTokenOutMwh: number;
    /** True when the request lies beyond the measured token range or off the benchmark effort. */
    extrapolated: boolean;
    confidence: { minWh: number; maxWh: number };
  };
  water: {
    ml: number;
    l: number;
    breakdown: { onsiteMl: number; offsiteMl: number };
  };
  carbon: {
    gCO2e: number;
    kgCO2e: number;
    operationalG: number;
    embodiedG: number;
  };
  grade: GradeResult;
  factors: {
    taskMultiplier: number;
    reasoningEffort: ReasoningEffort | null;
    pue: number;
    wueOnsite: number;
    wueOffsite: number;
    cif: number;
    cifSource: string;
    cifHostDefault: number;
    embodiedFactor: number;
  };
}

export interface Comparison {
  /** Sorted most-efficient first. */
  results: Impact[];
  recommendation: string | null;
  best: Impact | null;
  worst: Impact | null;
  potentialSavings: {
    energyWh: number;
    waterMl: number;
    carbonG: number;
    /** Unrounded fraction saved, 0–1. */
    ratio: number;
    /** Rounded percentage; never 100 unless the best option uses zero energy. */
    percentage: number;
  } | null;
}

export interface Totals {
  queries: number;
  energyWh: number;
  waterMl: number;
  carbonG: number;
}

/** Flat history record as stored by the extension and mobile app. */
export interface HistoryLike {
  energyWh?: number;
  waterMl?: number;
  carbonG?: number;
  [key: string]: unknown;
}

export interface Region {
  key: string;
  name: string;
  cif: number;
}

export class ImpactEngine {
  constructor(bundle: { models: ModelsData; grids: GridsData; equivalents?: EquivalentsData | null });
  meta: Record<string, unknown>;
  grids: GridsData;
  equivalents: EquivalentsData | null;
  embodiedFactor: number;
  models: Record<string, ModelRecord>;
  listModels(): ModelSummary[];
  getModel(modelId: string): ModelRecord | null;
  getCategory(inputTokens: number, outputTokens: number): QueryCategory;
  getRegionCif(regionKey?: string | null): number | null;
  listRegions(): Region[];
  estimateImpact(request: ImpactRequest): Impact | null;
  gradeFor(energyWh: number): GradeResult;
  compareModels(request: { modelIds?: string[]; inputTokens: number; outputTokens: number; options?: ImpactOptions }): Comparison;
  aggregate(impacts: Array<Impact | HistoryLike | null | undefined> | null | undefined): Totals;
}

export function fitCoefficients(bench: BenchPoint[]): Coefficients;
export function autoDetectModel(hostname: string): string | null;
export const REASONING_EFFORT: Record<ReasoningEffort, number>;
export const GRADE_BANDS: Array<{ grade: Grade; maxWh: number }>;

// ------------------------------------------------------------------ analyzer

export type TaskType =
  | 'IMAGE_GENERATION'
  | 'AGENTIC_TASK'
  | 'CODE_GENERATION'
  | 'CREATIVE_WRITING'
  | 'DATA_ANALYSIS'
  | 'TEXT_SUMMARIZATION'
  | 'TRANSLATION'
  | 'QUESTION_ANSWERING'
  | 'GENERAL';

export interface TaskTypeConfig {
  keywords: Array<string | RegExp | { kw: string; weight: number }>;
  energyMultiplier: number;
  typicalOutputTokens: number | null;
  displayName: string;
  description: string;
}

export interface TaskTypeResult {
  type: TaskType;
  displayName: string;
  description: string;
  confidence: number;
  energyMultiplier: number;
}

export interface SpecialQuery {
  type: 'math' | 'location' | 'weather' | 'time';
  title: string;
  description: string;
  impact: string;
  savingsPercent: number;
}

export interface PoliteWords {
  found: Array<{ phrase: string; count: number; tokensSaved: number; example: string }>;
  totalTokensSaved: number;
}

export type OutputBudget =
  | {
      kind: 'words' | 'tokens' | 'characters' | 'sentence' | 'paragraph' | 'lines' | 'bullets' | 'items' | 'yes_no' | 'word';
      phrase: string;
      capTokens: number;
    }
  | { kind: 'style'; phrase: string; factor: number };

export interface OutputEstimate {
  estimated: number;
  min: number;
  max: number;
  /** What the task type alone would predict, before any budget. */
  baseline: number;
  budgeted: boolean;
}

export type TipKind =
  | 'special_query'
  | 'polite_words'
  | 'task_specific'
  | 'length'
  | 'output_budget'
  | 'output_budget_ok'
  | 'output_budget_long'
  | 'model';

export interface Tip {
  kind: TipKind;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: string;
  savingsPercent: number;
  /** Present on special_query tips. */
  type?: SpecialQuery['type'];
}

export interface PromptAnalysis {
  originalText: string;
  tokens: number;
  taskType: string;
  taskTypeRaw: TaskType;
  taskConfidence: number;
  taskDescription: string;
  energyMultiplier: number;
  politeWords: PoliteWords;
  outputBudget: OutputBudget | null;
  outputEstimate: OutputEstimate;
  tips: Tip[];
  optimizedTokenEstimate: number;
}

export function estimateTokens(text: string): number;
export function detectTaskType(text: string): TaskTypeResult;
export function detectSpecialQueryType(text: string): SpecialQuery | null;
export function detectPoliteWords(text: string): PoliteWords;
export function detectOutputBudget(text: string): OutputBudget | null;
export function maskProtectedSpans(text: string): string;
export function estimateOutputTokens(taskType: TaskType | string, inputTokens: number, budget?: OutputBudget | null): OutputEstimate;
export function getOptimizationTips(
  politeWords: PoliteWords,
  taskType: TaskTypeResult,
  tokens: number,
  originalText?: string,
  outputBudget?: OutputBudget | null
): Tip[];
export function generateOptimizedPrompt(text: string): string;
export function analyzePrompt(text: string): PromptAnalysis | null;
export const TASK_TYPES: Record<TaskType, TaskTypeConfig>;
export const POLITE_PHRASES: Array<{ pattern: RegExp; word: string; tokens: number; anchored?: boolean }>;

// --------------------------------------------------------------- conversions

export interface Relatable {
  /** Everyday equivalent, e.g. "4 minutes of an LED bulb". */
  primary: string;
  /** Technical figure, e.g. "0.42 Wh". */
  secondary: string;
}

export interface Converters {
  energy(wh: number): Relatable;
  water(ml: number): Relatable;
  carbon(g: number): Relatable;
  forImpact(impact: Impact): { energy: Relatable; water: Relatable; carbon: Relatable };
  forTotals(totals: Totals, periodLabel?: string): { energy: Relatable; water: Relatable; carbon: Relatable; sentence: string };
  factors: Record<string, number>;
}

export function createConverters(equivalents?: EquivalentsData | null): Converters;

// --------------------------------------------------------------------- entry

export const data: { models: ModelsData; grids: GridsData; equivalents: EquivalentsData };
export function createDefaultEngine(): { engine: ImpactEngine; converters: Converters };
