# 技术架构文档（ARCHITECTURE）

版本：v1.0 规划稿 ｜ 日期：2026-11-19 ｜ 配套：PRODUCT.md / SIMULATION.md

## 1. 技术栈与选型理由

| 技术 | 用途 | 说明 |
|---|---|---|
| React 19 + TypeScript | UI | 严格模式 `strict: true` |
| Vite | 构建/开发 | 纯前端 SPA，无 SSR |
| Tailwind CSS v4 | 样式 | 深色主题 design tokens 统一定义 |
| ECharts | 财富曲线 | 按需引入（line + markPoint），避免全量打包 |
| Motion（framer-motion 后继） | 动效 | 数字滚动、事件卡片进出场、视图过渡 |
| Vitest | 测试 | 引擎为纯函数，测试无需 DOM |
| zustand | 全局状态 | **新增依赖**，理由见下 |

zustand 的引入理由：模拟状态（引擎快照、播放状态机、选择日志）被 HUD、曲线、事件弹窗、结局页多处读写，且播放循环在 React 渲染之外驱动。用 Context + useReducer 会导致整棵树随每年 tick 重渲染；zustand 支持选择性订阅且可在 React 外读写，体积 ~1KB，是此处复杂度最低的方案。除此之外不引入任何状态/路由/请求库。

**不引入路由库**：只有四个视图（开局/模拟/结局/分享接收），用视图状态机切换；分享数据放 URL hash，手动解析。避免 react-router 带来的无谓复杂度。

## 2. 分层架构与依赖规则

```
┌────────────────────────────────────────────────┐
│  views/        setup · simulation · ending     │  React 组件
├────────────────────────────────────────────────┤
│  playback/     播放状态机 · rAF 驱动 · 恢复     │  编排层（可含副作用）
│  store/        zustand stores                  │
├────────────────────────────────────────────────┤
│  simulation/   引擎 · RNG · 目标 · 结局判定     │  纯 TS，零依赖
│  events/       事件定义数据 · 触发匹配器        │  纯 TS，零依赖
└────────────────────────────────────────────────┘
```

硬性依赖规则（AGENTS.md 中列为红线）：
1. `simulation/` 与 `events/` **禁止 import** React、zustand、ECharts、Motion、DOM API、`Math.random`、`Date.now`。
2. 引擎不读事件文案；事件不直接改财富数字。事件通过声明式 `EventEffect` 描述影响，由引擎统一应用。
3. 所有随机性必须来自注入的种子 RNG 实例，任何模块不得私用 `Math.random`。
4. 展示层（名义→实际购买力换算、货币格式化）只存在于 `views/` 与 `lib/format.ts`，引擎内部一律名义值。

## 3. 核心数据结构（TypeScript 契约）

以下接口是模块间的稳定契约，实现时允许加字段，不允许破坏语义。

```ts
// ---------- 输入 ----------
interface SimInputs {
  startAge: number;            // 18–70
  startYear: number;           // 真实日历起始年，由调用层注入；重播保留；引擎禁止读系统时间
  initialAssets: number;       // 名义值，¥，≥0
  annualIncome: number;        // 税后，名义值，¥
  annualExpenses: number;      // 名义值，¥，>0
  goal: { mode: 'auto' }       // 目标 = 当年支出 × 25（动态线）
      | { mode: 'manual'; amount: number }; // 开局购买力，随通胀抬升
  endAge: number;              // 默认 90
}

interface SimConfig {          // 财务假设，集中一处，见 SIMULATION.md
  inflation: number;           // 0.025
  incomeGrowth: number;        // 0.03 名义
  marketMean: number;          // 0.07 名义
  marketStd: number;           // 0.15
  withdrawalMultiple: number;  // 25
  debtRate: number;            // 0.08
  returnFloor: number;               // −0.95，收益率下限
  bankruptConsecutiveYears: number;  // 5，连续负资产破产年数
  bankruptDebtMultiple: number;      // 5，债务失控倍数（净资产 < −5×当年支出）
}

// ---------- 引擎状态 ----------
interface YearState {
  yearIndex: number;           // 0 = 开局年
  age: number;
  calendarYear: number;        // inputs.startYear + yearIndex
  assetsStart: number;         // 年初名义净资产（= 上一年年末资产）
  assets: number;              // 年末名义净资产（可为负）
  income: number;              // 当年名义收入
  expenses: number;            // 当年名义支出
  marketReturn: number;        // 当年收益率 r_t
  goalAmount: number;          // 当年名义目标线
  eventId: string | null;      // 当年触发的事件
  choiceId: string | null;     // 玩家选择（重播时注入）
  eventCash?: number;          // 选项直接现金合计（含相对现金，不含延迟现金）
  scheduledCashApplied?: number; // 当年结算的延迟现金（scheduledCash 到期）
}

interface ScheduledEvent { eventId: string; dueYear: number; }
interface ScheduledCash {
  dueYear: number; amount: number; probability: number; sourceEventId: string;
}

interface SimState {
  inputs: SimInputs;
  config: SimConfig;
  seed: string;
  years: YearState[];          // 已最终结算的历史，只追加；每年恰好一条
  modifiers: Modifier[];       // 生效中的持续性修正（见下）
  flags: Set<string>;          // 事件互斥/剧情标记（序列化时为 string[]）
  flagTimers: { flag: string; expiresAtYear: number }[]; // 限期 flag 的到期年（与 Modifier 同口径）
  status: 'running' | 'fire' | 'bankrupt' | 'end';
  negativeYears: number;       // 连续年末负资产年数（破产判定用）
  pending: { year: YearState; event: EventDef } | null; // 两阶段步进的暂记年，未入历史
  eventPool: EventDef[];       // 本局事件池（数据驱动注入，默认空）
  scheduledEvents: ScheduledEvent[]; // 延迟强制事件（scheduleEvent 注册，到期强制触发）
  scheduledCash: ScheduledCash[];    // 延迟现金（到期按概率子流结算）
}

// 初始化：createInitialState(inputs, seed, config?, eventPool?)
// 开局 initialAssets ≥ 开局目标线且 > 0 → status='fire' 且 years=[]，不做任何年度结算。

// ---------- 事件 ----------
interface EventDef {
  id: string;
  category: 'career' | 'family' | 'market' | 'lifestyle' | 'shock' | 'debt-crisis';
  weight: number;              // 抽取权重
  minAge: number; maxAge: number;
  cooldownYears: number;       // 同事件最小间隔
  once: boolean;               // 一生仅一次
  requiresFlags?: string[];
  excludesFlags?: string[];
  minAssets?: number; maxAssets?: number;   // 名义值门槛
  minMarketReturn?: number; maxMarketReturn?: number; // 市场故事与真实行情一致
  weightModifiers?: { flag: string; multiplier: number }[]; // 持 flag 时权重乘数
  forcedOnly?: boolean;        // 不进随机池，仅救援/scheduleEvent 强制触发
  title: string; description: string;
  choices: EventChoice[];
}

interface EventChoice {
  id: string;
  label: string;               // 选项文案
  hint: string;                // 代价/收益提示，必须与 effects 一致
  effects: EventEffect[];
}

interface EffectCondition { requiresFlags?: string[]; excludesFlags?: string[] }
// condition：逐效果按当前 flags 决定是否应用（不满足则跳过该效果）。

type EventEffect =
  | { type: 'cash'; amount: number; probability?: number; condition?: EffectCondition }
  | { type: 'cashRelative'; basis: 'assetsNow' | 'annualIncome' | 'initialAssets';
      ratio: number; probability?: number; condition?: EffectCondition }
  // assetsNow = 事件年选项前年末资产；annualIncome = 事件年名义收入；initialAssets = 开局资产
  | { type: 'incomeMult'; factor: number; durationYears: number | 'permanent'; condition?: EffectCondition }
  | { type: 'expenseMult'; factor: number; durationYears: number | 'permanent'; condition?: EffectCondition }
  | { type: 'returnDelta'; delta: number; durationYears: number | 'permanent'; condition?: EffectCondition }
  | { type: 'setFlag'; flag: string; durationYears?: number; condition?: EffectCondition }
  // durationYears：与同期修正同生命周期（t+d+1 起失效）；省略 = 永久
  | { type: 'clearFlag'; flag: string; condition?: EffectCondition }
  | { type: 'scheduleEvent'; eventId: string; afterYears: number; condition?: EffectCondition }
  | { type: 'scheduledCash'; amount: number; afterYears: number; probability?: number; condition?: EffectCondition };

interface Modifier {           // 引擎内的生效中修正
  kind: 'incomeMult' | 'expenseMult' | 'returnDelta';
  factor: number;              // mult 为乘数，delta 为加数
  expiresAtYear: number | null; // null = permanent；事件年 t 持续 d 年 → t+d+1（生效区间 [t+1, t+d]）
  sourceEventId: string;
}

// ---------- 重播 / 分享 ----------
interface ChoiceLogEntry { yearIndex: number; eventId: string; choiceId: string; }

interface ReplaySource {
  inputs: SimInputs;
  seed: string;
  choices: ChoiceLogEntry[];
}
interface ReplayData extends ReplaySource {
  v: 2;
  rulesVersion: 'wealth-life-2';
  outcome: {
    status: 'fire' | 'bankrupt' | 'end';
    years: number;
    calendarYear: number;
    age: number;
  };
  fingerprint: string;
}

// localStorage 独立保留 v1 游标契约，不使用分享版本校验。
interface SavedRun {
  v: 1;
  inputs: SimInputs;
  seed: string;
  choices: ChoiceLogEntry[];   // 仅已结算年的选择
  nextYearIndex: number;       // 已结算年数 = 下一个待推进年；eventPending 时待决年恰为该游标
  playback: 'playing' | 'paused' | 'eventPending' | 'finished';
  speed: 1 | 2 | 4;
}
```

## 4. 模块职责与关键 API

### 4.1 simulation/rng.ts — 确定性随机

P4-C 审计阻断（2026-11-20）：同运行时可复现不等于跨运行时结局一致。`boundary-194`、手动目标 1037259.3769049707 在 Chrome/Node 第 1 年 FIRE，在系统 JavaScriptCore 第 2 年 FIRE；两端空日志都能完整消费，当前 v1 分享仍会接受不同结果。完整重建校验解决缺失/冲突日志，但尚不能证明与发送端结果相同。原始失败证据另保留为 `*-before-v2.json`。2026-11-20本次任务授权统一货币语义与分享v2：采用SIMULATION §1.1的固定分判定，不改年度公式，舍入边界残余差异必须安全拒绝。证据见 `.qa/p4c-share-boundary-results.json` 与 `.qa/p4c-cross-runtime-results.json`。

- 基础算法：`xmur3`（字符串→32 位哈希）+ `mulberry32`（PRNG）。实现短小、可测试、无依赖。
- **子流隔离**：`createRng(seed, domain)`，domain 如 `market:12`、`event:12`。同一年份的市场抽样与事件抽样互不干扰——事件是否触发、触发哪个，不会改变市场收益序列。这是「改选事件后市场走势不变」这一玩家直觉的技术保证。
- 正态抽样：Box–Muller，输入来自子流均匀分布。
- 禁止在任何其他地方出现随机源。

### 4.2 simulation/engine.ts — 年度步进引擎（纯函数）

```ts
function createInitialState(inputs, seed, config?, eventPool?): SimState; // 开局即 FIRE 在此判定
function stepYear(state: SimState, choice?: ChoiceLogEntry): StepResult;
interface StepResult {
  state: SimState;             // 新状态（不可变更新）
  year: YearState;             // 当年快照（暂记或最终）
  pendingEvent: EventDef | null; // 需要玩家决策时非空；status 仍为 running
}
```

步进顺序（详见 SIMULATION.md 第 3 节）：结算到期修正 → 计算当年收入/支出 → 市场收益 → 现金流结算 → 到期延迟现金结算 → 债务救援判定 → 目标判定/破产判定 → 事件触发匹配。无事件年直接最终结算并追加 `years`；有事件年返回 `pendingEvent`，暂记年放入 `state.pending`（不入历史），编排层暂停播放等待选择，然后以 `choice` 再次调用：应用事件效果、重判结局、追加唯一一条历史快照。**两阶段不会重复抽样市场收益或重复计入现金流；状态为 pending 时不传 choice 调用属于编程错误，直接抛错。**

债务救援优先级：年末资产为负且救援事件未用过时，先挂起 `debt-crisis` 强制决策，结局判定推迟到 finalize；普通事件选择导致首次负债时不追加同年事件，首次救援处理前暂缓破产，次年仍负债优先补救、已非负则无需救援；救援后仍满足条件即可破产，历史保证救援最多一次。连续负债计数基于最终年末历史，而非选择前的暂记资产。running 状态下到期的 scheduledEvents 先于普通概率抽取强制触发（不消耗全局间隔），forcedOnly 事件不进随机池。

引擎还提供：
```ts
function replay(inputs, seed, choices: ChoiceLogEntry[], config?, eventPool?): SimState; // 确定性重建
// 重播到某个 pendingEvent 缺少对应 choice 时停在该年（返回带 pending 的 running 状态），
// 这是「回到关键抉择」截断重播与刷新恢复的基础。
// choice 匹配同时校验 yearIndex + eventId；choiceId 不在事件选项内时安全停住，不应用到不匹配事件。
function choiceLog(state: SimState): ChoiceLogEntry[]; // 从 years 派生选择日志（重播/回顾数据源）
function calculateFinancialYear(inputs, config, seed, yearIndex, assetsStart, modifiers?): YearState;
```

`calculateFinancialYear` 是纯年度财务内核（收入、支出、市场、负债、目标线），接收已筛选的生效修正；普通局仍由 stepYear 管理修正到期、事件与终止。蒙特卡洛不改 stepYear 的停止语义。

#### simulation/montecarlo.ts — 无事件完整年限基线

```ts
function runMonteCarlo(inputs: SimInputs, baseSeed: string, n?: number, config?: SimConfig): MonteCarloResult;
function runStrategyComparison(inputs: SimInputs, baseSeed: string, n?: number, config?: SimConfig,
  strategies?: readonly InvestmentStrategy[]): StrategyComparison[];
function compareWithParallelLives(actual: SimState, result: MonteCarloResult): ParallelLifeComparison | null;
```

结果契约定义在 simulation/types.ts：
- `MonteCarloResult`：model='continued-work-no-events'、inputs/config/baseSeed、totalPaths、initial、years、paths、fireCount/nonFireCount、fireRate/nonFireRate、medianFireAge、firstFireDistribution、bankruptcyCount。
- `AssetDistribution`：phase/yearIndex/calendarYear/age、goalAmount、sortedAssets、p10/p50/p90；`initial` 和 t=0 年末是不同分布。
- `MonteCarloPath`：seed、完整 YearState[]、firstFire、firstBankruptcy（时点或 null）；firstFire 仅指首次破产前达标。
- `FirstFireBucket`：时点 + count/proportion（分母是全部 n 条路径）；无成功时分布为空、medianFireAge=null。
- `StrategyComparison`：strategy（id/label/μ/σ）+ result；相同路径种子与 market:t 子流配对，输出不重排。
- `ParallelLifeComparison`：时点、actualAssets、sampleCount、belowCount/equalCount、percentile（0…100 中位秩）、strictlyBelowRate（0…1）、p10/p50/p90。同起点、同年、同相位名义值；取已结算快照而不是结局页的跨龄标签。

只在调用层测量耗时，结果可 JSON 序列化且同一 JS 运行时同输入同种子字节一致。复用原引擎 Math.pow / Box–Muller 浮点算术，Node 与 Chrome 跨版本可有末位尾差，不宣称跨运行时逐字节相同；保留原始算术轨迹，金额判定统一采用SIMULATION §1.1的分规则。跨运行时另核对原始尾差、货币规范化结果与离散结局，不用相对误差容差放行分享。P4-B 图表订阅 years 分位带、个人真实 years 与同年比较结果；界面需明确「继续工作投资基线，非退休财富预测」。初始点单独绘制，不能和 t=0 年末点合并。

### 4.3 events/ — 事件数据与匹配

- `events/definitions/*.ts`：按 category 分文件的事件定义数据（16 常规 + 1 救援，见 SIMULATION.md），`definitions/index.ts` 汇总导出 `EVENT_POOL`。
- `events/matcher.ts`：`pickEvent(state, rng): EventDef | null`。过滤条件（年龄/资产/flag/cooldown/once/市场收益门槛）→ 按 weight（含 weightModifiers）加权抽取。节奏：首个常规事件强制落在第 2–4 年（优先 career，可空池回退）；全局最小间隔 2 年；触发概率随距上次事件年数递增（`min(0.15 + 0.05×gap, 0.5)`）。与具体事件内容解耦。

### 4.4 playback/ — 播放编排（唯一有副作用的模拟相关层）

状态机：
```
idle → playing ⇄ paused
playing → eventPending（引擎返回 pendingEvent）
eventPending → playing（玩家选择后）
playing → finished（status ≠ running）
任意 → idle（重新开始）
```

- rAF 驱动计时：默认 1.1 秒/年，速度倍率 1×/2×/4× 只改变计时，不改变引擎输入。
- 每年 tick 调 `stepYear`，把 `YearState` 追加进 store；数字滚动与曲线追加由视图订阅完成。
- **暂停/恢复**：暂停只是停止计时器，引擎状态无损；恢复继续。
- **刷新恢复**：`SavedRun` 在确定性检查点写入 localStorage（每年结算、每次选择、暂停/变速、开局/回退；不写动画帧）。重进页面时 `playback/restore.ts` 的 `rebuildTo(inputs, seed, choices, nextYearIndex, config?, eventPool?, expectPending?)` 手动步进重建到游标：`expectPending=false` 停在游标边界不预计算下一年（playing/paused 存档）；`true` 时计算游标当年并保留 pending（eventPending 存档与「回到关键抉择」）。`replay()` 会一路跑到下一个缺选择的事件，无法停在任意已观看年份，故恢复不用它。重算是毫秒级的（≤72 步）。损坏/版本不匹配存档静默拒绝，回到开局页；重建后必须严格匹配游标、终局/待决状态与全部已消费选择，不能将重建出的较早进度冒充原存档。
- **自动重播**：`replayChoices` 非空时为观看模式；事件待决时按 1.6s/速度 的定时器自动套用日志中的原选择（校验 yearIndex+eventId+choiceId 与 runId/pending 身份）。外部分享进入接收页前必须完整重建到结局，且全部日志恰好消费；缺失、冲突或多余选择安全拒绝并返回开局，不能降级成部分人生。内部截断重建仍保留停在待决事件的能力。观看模式不写存档，不覆盖自己的进度；从分享改选转为自己的分支时清除旧 hash。

#### P4-B 按需计算编排

- `playback/parallelCalculation.ts`：调用 runMonteCarlo（平衡首批）与 runStrategyComparison（每次一个策略）、compareWithParallelLives；仅投影 UI 所需分位带、首次分布和同年比较，完整路径与排序样本不跨线程传输。计时在本调用层，不改纯引擎。
- `playback/parallel.worker.ts`：每条消息只算一个策略；输入为当前 SimState，输出精简视图结果及耗时。
- `playback/parallel.ts`：单局会话缓存，key 包含 runId、inputs、seed、config 与实际历史。先平衡再进取/保守；每次响应后分任务调度下一策略。订阅去重，StrictMode 短暂退订延迟取消；收起/退出终止 Worker，保留完成缓存；新 key 淘汰旧局，实例身份校验拒绝过期响应。失败显示可重试提示，不悄悄切换不同模型。
- 引入 Worker 的实测依据（2026-11-20）：300×72 同步计算，4× CPU 限速五次 79.6–90.8ms，6× 五次117.0–133.1ms，主线程明显阻塞；详见 .qa/p4b-sync-benchmark.json。不新增依赖，不改 P4-A 算法。
- `views/ending/parallelData.ts` 只做门槛累计、图表相位/实际年份映射与格式化；`ParallelChart` 使用带 stackStrategy=all 的区间堆叠以覆盖负资产，直线插值不生成额外资产；`ParallelUniverses` 提供探索入口、策略与年份选择。

### 4.5 store/ — zustand

- `simStore`：SimState 快照、pendingEvent、播放状态机、速度、`replayChoices`（观看模式日志）。动作：`start`（新种子）、`startReplay(data)`（同种子同选择观看）、`replayCurrent()`、`rewindTo(yearIndex)`（前缀 choices + 同种子 rebuildTo 到目标待决年）、`restoreSaved()`、`tick/choose/togglePause/setSpeed/restart`。
- `uiStore`：当前视图（setup/simulating/ending/shared）、事件历史抽屉开关、`shareError` 提示、`sharedData` 接收的 ReplayData。
- 视图按字段订阅，避免每年 tick 全树重渲染。

### 4.6 views/ — 四个视图

- `setup/`：输入表单（受控组件 + 即时校验）、随机人生、坏分享链接的中性提示。
- `simulation/`：HUD、AssetCounter（Motion 数字滚动）、WealthChart（ECharts 增量 append）、EventCard（观看模式标记原选择并禁用按钮）、事件时间线抽屉。
- `ending/`：`EndingView`（四种氛围、≤4 个关键数字、叙事、操作入口）、`narrative.ts`（只从真实 years/choices 派生开场/转折点/故事/收尾，转折点=现金影响绝对值最大的事件年）、`EndingChart`（完整曲线 + 事件标记散点 + 终点节点 + 点击回看）、`RewindPanel`（本局选择列表 → rewindTo）。
- `shared/`：接收页「观看 TA 的人生」（startReplay）/「相同起点，我来试试」（start 新种子）。

### 4.7 lib/

- `format.ts`：货币格式化（¥ 千分位 / 「万」缩写）、名义→实际换算 `toReal(nominal, yearIndex, inflation)`。**换算只在这里和视图层发生。**
- `share.ts`：`ReplayData` ⇄ URL hash（JSON → UTF-8 → base64url，`#r=` 前缀），带 `v` 版本校验。解码全量校验：金额/年龄/年份范围、种子长度 ≤128、choices ≤200 且年份严格递增、eventId/choiceId 必须属于 EVENT_POOL、hash ≤16384 字符；任何非法输入返回中性错误文案，不抛异常。
- `storage.ts`：localStorage 读写（`SavedRun` 与上次输入）。只复用输入/种子/日志校验，独立验证存档v1；分享升级不要求本地进度具有终局。旧本地存档仍按当前规则重建并严格验证游标/状态/日志，极端边界无法恢复时拒绝，不承诺旧规则位级还原；存储不可用时静默降级。

#### 分享 v2 一致性边界

`createReplayData(sim)` 只接受完整终局，生成 `v=2` 与 `rulesVersion=wealth-life-2`。终局记录状态、已结算年数、显示年份和年龄（开局FIRE零年；end显示跨入endAge）。指纹为固定字段顺序的规范化轨迹JSON，按UTF-16LE字节执行FNV-1a-128，32位小写十六进制；算法由分享v2定义。后续公式、金额判定、随机算法或事件效果发生不兼容变化时必须更新rulesVersion，不能复用旧规则标识。

摘要包含输入（原始已传输数值，防止参数静默改变）、种子、全部选择、配置、初始资产/目标、逐年时点/全部金额字段/事件与选项，以及终局含称号。金额转SIMULATION §1.1的分整数字符串；收益率仅在摘要中按小数点后12位规范化，不对未经规范化的浮点轨迹JSON直接哈希。规范化边界仍可能导致拒绝，绝不扩大容差自动放行。指纹是结果一致性校验，不是签名、身份认证或防篡改证明，主动修改者可重新计算，哈希存在理论碰撞可能。

接收先校验结构与规则版本，再完整重建、核对日志恰好消费、终局逐字段相等及指纹相等，全部通过才进入观看页。拒绝缺失/冲突日志、被修改的终局或轨迹、未知规则/格式；v1明确提示旧链接无法验证，请重新分享，并提供现有开局入口。内部回溯/自动观看使用无外部身份含义的ReplaySource，不能把它当作已验证分享。公开入口始终先验证v2。

## 5. 确定性与重播机制（核心保证）

1. 同规则、同JS运行时中，一局游戏 = `inputs + seed + choices` 的纯函数，`replay(inputs, seed, choices)` 得到逐年完全一致的 `YearState[]`。不同运行时依分享v2验证规范化轨迹与终局；不一致明确拒绝，不承诺原始浮点逐位一致。
2. 种子在开局时生成一次（`crypto.randomUUID()`，这是唯一允许的非确定随机，仅用于产生种子本身），之后全程不变。「换一种人生」= 新种子；「回到关键抉择」= 同种子截断 choices 后重播。
3. 子流隔离保证：改选某事件不影响其他年份的市场收益与事件抽取序列（事件抽取依赖的资产门槛可能变化，这是合理的因果，文档化为预期行为）。
4. 分享链接携带完整 ReplayData；接收方重播时事件处自动展示原选择，无需交互。
5. 「回到关键抉择」= 保留目标年之前的 choices、同种子 `rebuildTo(..., expectPending=true)` 停在目标待决年；分歧点之前逐年不变，之后由引擎重新生成（延迟调度/flag/修正随分支保留或取消，不泄漏旧分支）。
6. Vitest 必须包含：同输入同种子两次 replay 深相等；不同 domain 子流互不影响；choices 截断重播与原始前缀一致；游标重建与 replay 等价；分享编解码往返与非法拒绝；存档恢复各播放状态；叙事只引用真实事件。

## 6. 建议项目目录结构

```
A-Real-Life/
├── AGENTS.md
├── docs/
│   ├── PRODUCT.md  ARCHITECTURE.md  SIMULATION.md  ROADMAP.md
├── index.html
├── package.json  tsconfig.json  vite.config.ts
├── public/                      # favicon、结局分享预览图
└── src/
    ├── main.tsx  App.tsx        # 视图状态机根组件
    ├── styles/                  # tailwind 入口 + design tokens
    ├── simulation/
    │   ├── types.ts             # 第 3 节全部契约
    │   ├── config.ts            # 默认 SimConfig
    │   ├── rng.ts               # xmur3 + mulberry32 + 子流 + 正态
    │   ├── engine.ts            # stepYear / replay
    │   ├── goals.ts             # 目标线计算（auto/manual）
    │   ├── endings.ts           # 结局判定 + 分档
    │   ├── money.ts             # 固定分单位的十进制规范化与比较
    │   ├── replaySignature.ts   # 分享规则版本与规范化轨迹指纹
    │   └── montecarlo.ts        # P4
    ├── events/
    │   ├── matcher.ts
    │   └── definitions/         # career.ts family.ts market.ts lifestyle.ts shock.ts
    ├── playback/
    │   ├── driver.ts            # rAF 计时
    │   └── restore.ts           # rebuildTo 游标重建（刷新恢复 / 回到抉择）
    ├── store/
    │   ├── simStore.ts  uiStore.ts
    ├── views/
    │   ├── setup/  simulation/  ending/  shared/
    │   └── ending/              # EndingView / narrative.ts / EndingChart / RewindPanel
    ├── lib/
    │   ├── format.ts  share.ts  storage.ts
    └── test/                    # 引擎/事件/重播/口径不变量测试
```

## 7. 测试策略

| 层 | 工具 | 关键用例 |
|---|---|---|
| simulation | Vitest（纯函数） | 确定性重播；现金流守恒（无事件年：ΔW = W·r + income − expenses）；通胀口径（实际值 = 名义/(1+π)^t）；目标线 auto/manual；破产分支；修正到期 |
| events | Vitest | 门槛过滤正确；cooldown/once/flag 互斥；加权抽取分布合理（大样本卡方宽松断言）；每个选项 hint 与 effects 数值一致性（静态校验） |
| share | Vitest | ReplayData 编解码往返（含中文/emoji）；版本不匹配、非法金额/年龄/种子/choices、损坏与超长 hash 拒绝 |
| restore/rewind | Vitest | rebuildTo 各游标语义（playing/paused/eventPending/结局/开局 FIRE）；存档损坏拒绝；截断前缀一致；改选后延迟调度与 flag 保留/取消；store 层刷新恢复与自动重播等价 |
| narrative | Vitest | 叙事引用事件均存在于真实历史；转折点=最大现金影响；无事件/开局 FIRE 不虚构 |
| montecarlo / parallel-lives | Vitest | 完整路径确定性；原引擎逐年等价；分位插值；FIRE/破产首次时点与守恒；同冲击策略；同年百分位与平局；非法 n / 空分布 / 极端输入 |
| views | 手动浏览器验收 | 按 ROADMAP 各阶段验收清单执行（v1 不引入组件测试框架） |

## 8. 性能与体积预算

- 首屏 JS（gzip）≤ 350KB：ECharts 按需引入、事件数据为纯对象、无图片大图（渐变/ CSS 图形为主）。
- 每年 tick 的引擎计算 < 1ms；蒙特卡洛 300 路径 × 72 年 < 300ms（P4 验收项，必要时放 Web Worker，v1 先同步跑并实测）。
- 曲线最多 ~72 个点，ECharts 增量更新无压力；数字滚动用 Motion，不自己写 rAF 插值。