export interface SimInputs {
  startAge: number;
  startYear: number;
  initialAssets: number;
  annualIncome: number;
  annualExpenses: number;
  goal: { mode: 'auto' } | { mode: 'manual'; amount: number };
  endAge: number;
}

export interface SimConfig {
  inflation: number;
  incomeGrowth: number;
  marketMean: number;
  marketStd: number;
  withdrawalMultiple: number;
  debtRate: number;
  returnFloor: number;
  bankruptConsecutiveYears: number;
  bankruptDebtMultiple: number;
}

export type SimStatus = 'running' | 'fire' | 'bankrupt' | 'end';

export interface YearState {
  yearIndex: number;
  age: number;
  calendarYear: number;
  assetsStart: number;
  assets: number;
  income: number;
  expenses: number;
  marketReturn: number;
  goalAmount: number;
  eventId: string | null;
  choiceId: string | null;
  // 事件年：选项带来的直接现金（含相对现金，不含延迟结算）；历史回顾用。
  eventCash?: number;
  // 当年到账的延迟现金（如创业扩张结算）。
  scheduledCashApplied?: number;
}

export interface EventDef {
  id: string;
  category: 'career' | 'family' | 'market' | 'lifestyle' | 'shock' | 'debt-crisis';
  weight: number;
  minAge: number;
  maxAge: number;
  cooldownYears: number;
  once: boolean;
  requiresFlags?: string[];
  excludesFlags?: string[];
  minAssets?: number;
  maxAssets?: number;
  // 当年实际市场收益门槛：市场事件的故事必须与真实行情一致（如暴跌事件仅在当年大跌时可抽中）。
  minMarketReturn?: number;
  maxMarketReturn?: number;
  // 持有指定 flag 时抽取权重倍乘（如 health-risk 提高黑天鹅权重）。
  weightModifiers?: { flag: string; multiplier: number }[];
  // 只能被延迟调度或强制流程（债务救援）触发，不参与普通加权抽取。
  forcedOnly?: boolean;
  title: string;
  description: string;
  choices: EventChoice[];
}

export interface EventChoice {
  id: string;
  label: string;
  hint: string;
  effects: EventEffect[];
}

// 条件效果：仅当 flags 满足时才应用（如 leveraged 时暴跌现金惩罚翻倍）。
export interface EffectCondition {
  requiresFlags?: string[];
  excludesFlags?: string[];
}

interface EffectBase {
  condition?: EffectCondition;
}

export type EventEffect =
  | ({ type: 'cash'; amount: number; probability?: number } & EffectBase)
  // 相对现金：基准明确——assetsNow=事件当年未选择前的年末资产；annualIncome=事件当年名义收入；initialAssets=开局资产。
  | ({
      type: 'cashRelative';
      basis: 'assetsNow' | 'annualIncome' | 'initialAssets';
      ratio: number;
      probability?: number;
    } & EffectBase)
  | ({ type: 'incomeMult'; factor: number; durationYears: number | 'permanent' } & EffectBase)
  | ({ type: 'expenseMult'; factor: number; durationYears: number | 'permanent' } & EffectBase)
  | ({ type: 'returnDelta'; delta: number; durationYears: number | 'permanent' } & EffectBase)
  // durationYears：flag 与同期修正同生命周期，事件年 t 持续 d 年 → t+d+1 年起失效；省略 = 永久。
  | ({ type: 'setFlag'; flag: string; durationYears?: number } & EffectBase)
  | ({ type: 'clearFlag'; flag: string } & EffectBase)
  // 延迟剧情：afterYears 年后强制触发 eventPool 中的 forcedOnly 事件，绕过普通概率。
  | ({ type: 'scheduleEvent'; eventId: string; afterYears: number } & EffectBase)
  // 延迟现金：afterYears 年后结算，概率由 event:到期年:scheduled:来源事件 子流决定。
  | ({ type: 'scheduledCash'; amount: number; afterYears: number; probability?: number } & EffectBase);

export interface ScheduledEvent {
  eventId: string;
  dueYear: number;
}

export interface ScheduledCash {
  dueYear: number;
  amount: number;
  probability: number;
  sourceEventId: string;
}

export interface FlagTimer {
  flag: string;
  expiresAtYear: number;
}

export interface Modifier {
  kind: 'incomeMult' | 'expenseMult' | 'returnDelta';
  factor: number;
  expiresAtYear: number | null;
  sourceEventId: string;
}

export interface SimState {
  readonly inputs: SimInputs;
  readonly config: SimConfig;
  readonly seed: string;
  readonly years: readonly YearState[];
  readonly modifiers: readonly Modifier[];
  readonly flags: ReadonlySet<string>;
  readonly flagTimers: readonly FlagTimer[];
  readonly status: SimStatus;
  readonly negativeYears: number;
  readonly pending: { readonly year: YearState; readonly event: EventDef } | null;
  readonly eventPool: readonly EventDef[];
  readonly scheduledEvents: readonly ScheduledEvent[];
  readonly scheduledCash: readonly ScheduledCash[];
}

export interface ChoiceLogEntry {
  yearIndex: number;
  eventId: string;
  choiceId: string;
}

export interface ReplaySource {
  inputs: SimInputs;
  seed: string;
  choices: ChoiceLogEntry[];
}

export interface ReplayData extends ReplaySource {
  v: 2;
  rulesVersion: string;
  outcome: {
    status: Exclude<SimStatus, 'running'>;
    years: number;
    calendarYear: number;
    age: number;
  };
  fingerprint: string;
}

export interface SimulationPoint {
  phase: 'initial' | 'yearEnd';
  yearIndex: number;
  calendarYear: number;
  age: number;
}

export interface AssetDistribution extends SimulationPoint {
  goalAmount: number;
  sortedAssets: readonly number[];
  p10: number;
  p50: number;
  p90: number;
}

export interface MonteCarloPath {
  seed: string;
  years: readonly YearState[];
  firstFire: SimulationPoint | null;
  firstBankruptcy: SimulationPoint | null;
}

export interface FirstFireBucket extends SimulationPoint {
  count: number;
  proportion: number;
}

export interface MonteCarloResult {
  model: 'continued-work-no-events';
  inputs: SimInputs;
  config: SimConfig;
  baseSeed: string;
  totalPaths: number;
  paths: readonly MonteCarloPath[];
  initial: AssetDistribution;
  years: readonly AssetDistribution[];
  fireCount: number;
  nonFireCount: number;
  fireRate: number;
  nonFireRate: number;
  medianFireAge: number | null;
  firstFireDistribution: readonly FirstFireBucket[];
  bankruptcyCount: number;
}

export interface InvestmentStrategy {
  id: string;
  label: string;
  marketMean: number;
  marketStd: number;
}

export interface StrategyComparison {
  strategy: InvestmentStrategy;
  result: MonteCarloResult;
}

export interface ParallelLifeComparison extends SimulationPoint {
  actualAssets: number;
  sampleCount: number;
  belowCount: number;
  equalCount: number;
  percentile: number;
  strictlyBelowRate: number;
  p10: number;
  p50: number;
  p90: number;
}
