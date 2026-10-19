// Type declarations for @ecoprompt/core. Hand-written; the runtime is plain
// CommonJS with no build step (see index.js). Keep in sync when the engine's
// public surface changes — the analyzer/engine tests exercise every export.

export type Grade = 'A' | 'B' | 'C' | 'D' | 'E';
export type ReasoningEffort = 'low' | 'standard' | 'high';
/** Every effort level a provider can name, cheapest first (METHODOLOGY §2.5.7). */
export type EffortLevel = 'none' | 'low' | 'standard' | 'high' | 'xhigh' | 'max';
export type EffortVocabulary = 'anthropic' | 'openai' | 'google' | 'xai' | 'deepseek' | 'meta';
export type QueryCategory = 'short' | 'medium' | 'long';
export type DataSource = 'measured' | 'benchmarked' | 'extrapolated' | 'anchored';
/** current = pickable today (released 2026+); reference = older entry kept as evidence and for stored history. */
export type ModelStatus = 'current' | 'reference';
export type ThinkingMode = 'always' | 'adaptive' | 'optional' | 'none';

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

/** Provenance of one fact: fetched = a primary page was opened on checked_on. */
export interface SourceRef {
  url: string;
  status: 'fetched' | 'search-only';
  checked_on: string;
  /** Which facts this source backs, e.g. "params, released". */
  fact?: string;
}

export interface ModelEntry {
  model_id: string;
  name: string;
  provider: string;
  host: string;
  host_key?: string;
  size_class?: string;
  data_source?: DataSource;
  /** Defaults to 'current' for bundles that predate schema v3. */
  status?: ModelStatus;
  /** ISO date (YYYY, YYYY-MM or YYYY-MM-DD). Required for current entries. */
  released?: string;
  superseded_by?: string | null;
  /** Defaults from is_reasoning for bundles that predate schema v3. */
  thinking?: ThinkingMode;
  /** @deprecated schema v2; use thinking. */
  is_reasoning?: boolean;
  /** Which provider's effort labels apply (EFFORT_VOCABULARIES). */
  effort_vocab?: EffortVocabulary;
  /** The provider's documented default effort; used when none is given. */
  default_effort?: EffortLevel | 'medium';
  open_weight?: boolean;
  /** Parameter counts in billions; active_b is per token at decode. */
  params?: { total_b: number; active_b: number; precision?: string };
  /** How an unmeasured model is estimated (METHODOLOGY §2.5). Replaces performance. */
  estimate?: { method: EstimateMethod; tier?: 'small' | 'frontier' };
  /** Reference entries only: the tier this entry is evidence for. */
  tier?: 'small' | 'frontier';
  /** Reference thinking entries only: the non-thinking sibling it pairs with. */
  thinking_pair_of?: string;
  sources?: SourceRef[];
  provider_reported_anchor?: ProviderAnchor;
  /** Benchmark points. A current entry must cite them in performance_source. */
  performance?: { short: BenchPoint; medium: BenchPoint; long: BenchPoint };
  performance_source?: { url: string; status: 'fetched' | 'search-only' };
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
  status: ModelStatus;
  released: string | null;
  thinking: ThinkingMode;
  /** thinking !== 'none' */
  isReasoning: boolean;
}

export interface ModelRecord extends ModelSummary {
  hostKey: string;
  anchor: ProviderAnchor | null;
  defaultEffort: EffortLevel | null;
  effortVocab: EffortVocabulary | null;
  params: { total_b: number; active_b: number; precision?: string } | null;
  tier: string | null;
  thinkingPairOf: string | null;
  /** Set for an estimated model; bench is then empty. */
  estimate: { method: EstimateMethod; band: { low: number; high: number } | null; tierMembers: ModelRecord[] | null; inputs: EstimateInfo['inputs'] } | null;
  bench: BenchPoint[];
  benchMaxInput: number;
  benchMaxOutput: number;
  coefficients: Coefficients;
}

export interface ImpactOptions {
  /** Task-type energy multiplier (image ×3, agentic ×2, …); non-positive values are treated as 1. */
  taskMultiplier?: number;
  /** An EffortLevel or alias ('medium'); unknown or missing means the model's default_effort, else 'standard'. */
  reasoningEffort?: EffortLevel | 'medium' | string;
  /** Several agents answer at once (Grok Heavy): an estimated model's figure becomes a floor. */
  multiAgent?: boolean;
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

export interface ImpactGrade extends GradeResult {
  /** The figure is a lower bound (input clamped), so the grade is a floor. */
  provisional?: boolean;
  /** Grades of the range's ends, for an estimated model; high is null for a floor. */
  range?: { low: Grade; high: Grade | null };
  /** Show range.low–range.high, not grade. */
  rangeOnly?: boolean;
  /** "At least range.low": several agents answered and their count is unknown. */
  floor?: boolean;
}

export type EstimateMethod = 'active-params' | 'tier';

export interface EstimateInfo {
  method: EstimateMethod;
  rangeOnly: boolean;
  /** Hidden thinking tokens assumed, low and high; null for a model that does not think. */
  thinkingTokens: { lowTokens: number; highTokens: number } | null;
  inputs:
    | { activeB: number; totalB: number; bits: number; gpus: number; calibratedOn: string[]; ecologitsCommit: string }
    | { tier: string; members: string[] };
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
    /** True when the request lies beyond the measured token range or off the benchmark effort, and always for an estimated model. */
    extrapolated: boolean;
    /** Set when the input ran past the fitted range: the figure is a lower bound. */
    clamped: { term: 'input'; atTokens: number; requestedTokens: number; fittedMaxTokens: number; reason: string } | null;
    /** For an estimated model, the estimate's range; maxWh is null for a floor. */
    confidence: { minWh: number; maxWh: number | null };
    /**
     * Only for a model nobody has measured. With rangeOnly set, show lowWh–highWh, never wh.
     * A floor (several agents, count unknown) has highWh null: show "at least lowWh".
     */
    range: { lowWh: number; highWh: number | null; rangeOnly: boolean; floor: boolean } | null;
  };
  water: {
    ml: number;
    l: number;
    breakdown: { onsiteMl: number; offsiteMl: number };
    range: { lowMl: number; highMl: number | null } | null;
  };
  carbon: {
    gCO2e: number;
    kgCO2e: number;
    operationalG: number;
    embodiedG: number;
    range: { lowG: number; highG: number | null } | null;
  };
  grade: ImpactGrade;
  /** How an unmeasured model was estimated (METHODOLOGY §2.5); null for benchmarked models. */
  estimate: EstimateInfo | null;
  factors: {
    taskMultiplier: number;
    reasoningEffort: EffortLevel | null;
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
  /**
   * Present only when some entry was an estimate: lows summed with lows,
   * highs with highs. One floor makes every high null.
   */
  range?: {
    lowWh: number; highWh: number | null;
    lowMl: number; highMl: number | null;
    lowG: number; highG: number | null;
  };
}

/** Flat history record as stored by the extension and mobile app. */
export interface HistoryLike {
  energyWh?: number;
  waterMl?: number;
  carbonG?: number;
  /** An estimate's range, when the record is one; a null highWh is a floor. */
  lowWh?: number;
  highWh?: number | null;
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
  /** What the estimators derive from the reference entries (METHODOLOGY §2.5). */
  evidence: {
    calibration: { entries: string[]; k: number; kLow: number; kHigh: number; inPerOut: number; fixedTokens: number; benchMaxInput: number; benchMaxOutput: number } | null;
    tiers: Record<string, ModelRecord[]>;
    pairs: Array<{ thinking: ModelRecord; base: { id: string; coefficients: Coefficients; benchMaxInput: number } }>;
  };
  /** Current models only, unless includeReference is set. */
  listModels(options?: { includeReference?: boolean }): ModelSummary[];
  getModel(modelId: string): ModelRecord | null;
  getCategory(inputTokens: number, outputTokens: number): QueryCategory;
  getRegionCif(regionKey?: string | null): number | null;
  listRegions(): Region[];
  estimateImpact(request: ImpactRequest): Impact | null;
  gradeFor(energyWh: number): GradeResult;
  /** Omitting modelIds compares what listModels() would list. */
  compareModels(request: { modelIds?: string[]; includeReference?: boolean; inputTokens: number; outputTokens: number; options?: ImpactOptions }): Comparison;
  aggregate(impacts: Array<Impact | HistoryLike | null | undefined> | null | undefined): Totals;
}

export function fitCoefficients(bench: BenchPoint[]): Coefficients;
export function autoDetectModel(hostname: string): string | null;
export const REASONING_EFFORT: Record<ReasoningEffort, number>;
export const EFFORT_LEVELS: Record<EffortLevel, { rank: number; low: number; high: number }>;
export const EFFORT_VOCABULARIES: Record<EffortVocabulary, {
  status: 'fetched' | 'search-only';
  appDefault: EffortLevel | null;
  labels: Record<string, EffortLevel | { level: EffortLevel; multiAgent: boolean }>;
}>;
/** Canonical level for a key or alias, any case; null when unknown. */
export function effortLevel(key: unknown): EffortLevel | null;
/** What one label in a provider's app means; null when it is not an effort setting. */
export function effortFromLabel(vocab: string, label: string): { level: EffortLevel; multiAgent: boolean } | null;
export const GRADE_BANDS: Array<{ grade: Grade; maxWh: number }>;
export const MODEL_STATUSES: ModelStatus[];
export const THINKING_MODES: ThinkingMode[];
export const ESTIMATE_METHODS: EstimateMethod[];
/** EcoLogits constants, ported from genai-impact/ecologits at `commit`. */
export const ECOLOGITS: {
  commit: string;
  gpuEnergyAlpha: number; gpuEnergyBeta: number; gpuEnergyGamma: number;
  latencyAlpha: number; latencyBeta: number; latencyGamma: number;
  gpuMemoryGb: number; serverGpus: number; serverPowerKw: number; batchSize: number; defaultBits: number;
};
export const PRECISION_BITS: Record<string, number>;
export function ecologitsGpuCount(totalB: number, bits: number): number;
export function ecologitsItWhPerToken(activeB: number, totalB: number, bits?: number): { gpus: number; wh: number };

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
  /** "between … and …"; a null high end is a floor, "at least …". */
  energyRange(lowWh: number, highWh: number | null): Relatable;
  waterRange(lowMl: number, highMl: number | null): Relatable;
  carbonRange(lowG: number, highG: number | null): Relatable;
  /**
   * An estimated model always shows its range: "between … and …" when it
   * thinks, "at least …" for a floor, "about …" with the range as the
   * secondary otherwise. `times` repeats the same query.
   */
  forImpact(impact: Impact, times?: number): { energy: Relatable; water: Relatable; carbon: Relatable };
  forTotals(totals: Totals, periodLabel?: string): { energy: Relatable; water: Relatable; carbon: Relatable; sentence: string };
  factors: Record<string, number>;
}

export function createConverters(equivalents?: EquivalentsData | null): Converters;

/** How to label an impact on screen (PLAN.md Step 8). */
export interface ImpactDescription {
  estimated: boolean;
  method: EstimateMethod | null;
  /** "estimated · tier" or "estimated · from parameters"; null when measured or benchmarked. */
  methodChip: string | null;
  rangeOnly: boolean;
  floor: boolean;
  lowWh: number;
  /** Null for a floor. */
  highWh: number | null;
  /** The figure to show: the range when the model thinks, "≥ …" for a floor, else the point. */
  whText: string;
  /** The Wh range of an estimate; null when measured or benchmarked. */
  rangeText: string | null;
  /** "B", "B–E" when the range crosses a band, or "≥ C" for a floor. */
  gradeText: string;
  gradeLow: Grade;
  /** Null for a floor. */
  gradeHigh: Grade | null;
  /** For screen readers: "Eco-grade B to E". */
  gradeLabel: string;
  /** "likely high" on every estimate; null otherwise. */
  note: string | null;
  noteReason: string | null;
}

export interface SavingClaim {
  /** "percent" only when the ranges do not overlap; "probably" otherwise. */
  claim: 'percent' | 'probably';
  percentage: number | null;
  /** True when the percentage is better's dearest end against worse's cheapest. */
  atLeast: boolean;
  energyWh: number | null;
}

export function describeImpact(impact: Impact): ImpactDescription;
export function savingClaim(better: Impact, worse: Impact): SavingClaim | null;
export function formatWh(wh: number): string;
export function formatWhRange(lowWh: number, highWh: number | null): string;
export const METHOD_CHIPS: Record<EstimateMethod, string>;

// --------------------------------------------------------------------- entry

export const data: { models: ModelsData; grids: GridsData; equivalents: EquivalentsData };
export function createDefaultEngine(): { engine: ImpactEngine; converters: Converters };
