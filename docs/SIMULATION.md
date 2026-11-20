# 财富模拟系统设计（SIMULATION）

版本：v1.0 规划稿 ｜ 日期：2026-11-19 ｜ 本文档是引擎实现的唯一数学依据

## 1. 口径总原则（红线）

1. **引擎内部一切金额均为名义值（当年 ¥）**。实际购买力只在展示层换算：`real_t = nominal_t / (1 + π)^t`，t 为 yearIndex。
2. 收入、支出、目标线、事件现金门槛全部在同一口径（名义）下比较与运算。
3. 目标线是**动态名义线**（随通胀抬升），不是固定数字——否则后期达成判定会被通胀稀释，产生「明明够了却判输」的错误。
4. 现金流守恒：无事件年份必须满足 `W_{t+1} = W_t·(1+r_t) + income_t − expenses_t`，作为 Vitest 不变量。

### 1.1 货币判定精度（规则版本 `wealth-life-2`，2026-11-20）

- 计算与历史仍存名义 `number`，年度公式、Box–Muller、增长率、概率、事件现金均不改，不在每年结算时舍入。
- 金额比较使用固定 **0.01 元（分）**：将有限 number 的 ECMAScript 最短往返十进制表示按十进制四舍五入到分，恰好半分向远离零方向取整，负零归零。例如 1.005→101分、−0.005→−1分、−0.0049→0分。以十进制数字/指数转换到 BigInt，不先做 `amount*100`，不把分转换回不安全的 number；大额不降精度、不引入随金额增长的容差。number 在巨大量级已丢失的信息无法恢复。
- 统一用于初始/年末/事件后 FIRE、资产正负与负债利率分支、救援、连续负债、债务失控、事件资产门槛、终点称号金额门槛和同年资产排名；年龄、概率与市场收益率门槛不是金额，规则不变。自动/手动目标先按原公式算出，再分别与资产规范化比较；负债阈值先算 `−M*expenses` 再规范化。
- 因此相差不到一分的金额可能归入同一分，也可能位于相邻分；例如同为10000分可达标，9999分不能达到10000分。小于半分的负余额视为货币零，不触发救援/连续负债，但原始余额不被清零。
- 方案比较：A 固定分规则改动局部、保留全部算术轨迹，配合外部重播校验可实现“相同货币轨迹或明确拒绝”；B 替换 log/cos/sqrt/pow 为严格确定性的数值库或WASM可进一步统一算术，但需验证所有近似/舍入、改变旧市场轨迹并增加实现和维护成本。本次采用A，不重写引擎。
- 局限：任何量化都有舍入分界线，两个引擎仍可能落在半分两侧；原生数学和高金额 ULP 也没有全域误差上界。不得把分规则称为跨引擎位级确定性。分享必须逐年按此规则核对金额、事件及终局；任一不一致拒绝，而不是扩大容差。仅同运行时承诺原始数值重播深相等。

## 2. 财务假设（默认 SimConfig）

| 参数 | 符号 | 默认值 | 依据 |
|---|---|---|---|
| 通胀率 | π | 2.5%/年 | 长期温和通胀假设 |
| 收入名义增长 | g | 3%/年 | ≈ 通胀 + 0.5% 实际晋升加薪 |
| 市场名义收益均值 | μ | 7%/年 | 股债混合偏股组合的长期假设 |
| 市场收益标准差 | σ | 15%/年 | 偏股组合年化波动 |
| 收益率下限 | r_min | −95% | 防止正态尾部产生 r < −100% 的荒谬值；P(r < −95%) ≈ 0，截断偏差可忽略 |
| 财富自由倍数 | M | 25 | 4% 安全提取率（FIRE 惯例） |
| 负债利率 | d | 8%/年 | 净资产为负时按此计息，替代市场收益 |
| 终点年龄 | — | 90 | 默认，输入层暂不暴露 |

所有假设集中在 `simulation/config.ts`，事件与引擎不得硬编码这些数字。蒙特卡洛策略比较（P4）通过覆写 μ/σ 实现三档组合：进取 9%/22%、平衡 7%/15%、保守 4.5%/8%。

## 3. 年度步进公式（t = yearIndex，从 0 开始）

### 3.1 计算顺序（每年，严格按此序）

日历年由调用层注入：`calendarYear = inputs.startYear + t`（SimInputs 含 startYear，可序列化、随重播保留）；引擎禁止读取系统时间。

```
① 修正结算：移除 expiresAtYear ≤ t 的 Modifier
② income_t   = baseIncome   × (1+g)^t × Π(生效中 incomeMult)
③ expenses_t = baseExpenses × (1+π)^t × Π(生效中 expenseMult)
④ r_t = max( N(μ, σ) + Σ(生效中 returnDelta), −0.95 )     // N 来自 market:t 子流
⑤ 若 W_t ≥ 0：W_{t+1} = W_t × (1+r_t) + income_t − expenses_t
   若 W_t < 0：W_{t+1} = W_t × (1+d)   + income_t − expenses_t   // 负债不享受市场收益
⑤b 延迟现金：到期（dueYear ≤ t）的 scheduledCash 在此到账，概率由
   `event:t:scheduled:来源事件id` 子流抽样；直接加进当年末资产（曲线当年点体现）
⑥ 目标线：auto → goal_t = expenses_t × M
          manual → goal_t = amount × (1+π)^t
⑦ 救援优先：净资产为负且债务救援未用过（含事件导致负债的次年补救）→ 强制 pending `debt-crisis`，
   结局判定推迟到选择之后（见 4.2）；否则先判定 FIRE / 破产 / 终点
⑧ 事件匹配（见第 5 节）：running 时先到期的 scheduledEvents 强制触发（绕过概率），
   再进入普通概率匹配；若触发，返回 pendingEvent，播放暂停
```

约定与理由：
- **当年储蓄与事件现金在年末结算，不享受当年收益**。这是保守且一致的简化，避免「年初投入 vs 年末投入」的口径混乱；误差 ≤ 一年收益的半年，对游戏体验无影响，对守恒测试友好。
- ⑤ 的负债分支保证：欠债时市场大涨不会帮玩家「炒债翻身」，符合直觉。
- 多个同类修正**叠乘**（incomeMult/expenseMult）或**叠加**（returnDelta），到期自动移除。

### 3.2 事件年的两阶段步进

事件在当年计算完成后触发，玩家选择后**在同一年内**应用效果：

```
stepYear(state)            → { year: YearState(暂记，不追加进历史), pendingEvent }
stepYear(state, choice)    → 应用 effects：
    cash          → 固定现金，直接加到当年末资产（曲线当年点更新）
    cashRelative  → 相对现金：basis 为 assetsNow（事件当年未选择前的年末资产）/
                    annualIncome（事件当年名义收入）/ initialAssets（开局资产），乘 ratio
    *Mult/delta   → 生成 Modifier，expiresAtYear = t + duration + 1（permanent 为 null），从 t+1 生效
    setFlag/clearFlag → 写入 flags；setFlag 可带 durationYears，与同期修正同生命周期
                    （flagTimers 记录 expiresAtYear = t + d + 1，到期年在事件匹配前清除；省略 = 永久）
    scheduleEvent → 登记 { eventId, dueYear: t + afterYears }，到期强制触发（forcedOnly 事件）
    scheduledCash → 登记 { dueYear, amount, probability, sourceEventId }，按 ⑤b 到账
    condition     → 任何效果可带 { requiresFlags/excludesFlags }，不满足则跳过该效果
    → 重新执行 FIRE/破产判定（事件现金可能直接改变结局）
    → 最终结算后才把 YearState 追加进 years（每年历史快照恰好一条）
```

Modifier 生命周期精确定义：事件在第 t 年发生，持续 d 年的修正生效区间为 **[t+1, t+d]**（含两端），在 `t+d+1` 年的步骤 ① 被移除（移除条件 `expiresAtYear ≤ 当前 yearIndex`）。例：d=1 时仅 t+1 年生效，d=3 时生效于 t+1、t+2、t+3。

无事件年份在阶段一即完成最终结算并追加快照；有事件年份快照只在阶段二追加一次，**阶段一不得重复抽样市场收益、不得重复计入现金流**。

这保证 PRODUCT.md 的曲线规则：一次性影响体现在当年点，持续性影响从次年开始改变斜率；历史曲线点永不因后续事件被改写。

## 4. 结局判定

判定顺序：先 FIRE，后破产，最后终点。

### 4.1 财富自由（status = 'fire'）

`W_{t+1} ≥ goal_t` 且 `W_{t+1} > 0` → 立即结局。**达成时点口径：结局展示当年快照的 calendarYear 与 age**（YearState 的年份/年龄即该年度对应的年份与年龄，不再 +1）。
称号分档：达成年龄 < 40「传奇提前退休」；40–50「黄金自由」；> 50「大器晚成」。

### 4.2 财务崩溃（status = 'bankrupt'）

负资产且历史未处理过 `debt-crisis` 时，强制触发一次救援，优先于结局判定与普通事件。**救援优先于破产判定**：若首次负债由普通事件的选择造成，当年不追加第二个事件，也不在首次救援机会处理前直接判破产；次年结算后仍负债则优先救援，已恢复非负资产则无需救援。救援选择结算后仍满足破产条件可立即结局，历史保证救援最多一次。连续负资产年数只按最终结算的年末资产统计，事件选择前短暂转正不能清零。此边界于 P4-C 经确认修订，不改变收入、支出、市场或事件效果公式。
满足任一条件判崩溃结局：
- 连续 5 年年末净资产 < 0；
- 净资产 < −5 × 当年支出（债务失控，无力回天）。

### 4.3 走到终点（status = 'end'）

到达 endAge 未 FIRE。终止节点口径：**跨入 endAge**（age = endAge，calendarYear = startYear + (endAge − startAge)）；破产结局与 FIRE 相同，展示当年快照的年份与年龄。按 `ratio = 最终实际资产 / 最终目标线` 分档：

| ratio | 称号 | 基调 |
|---|---|---|
| ≥ 0.8 | 差一步的赶路人 | 遗憾但体面 |
| 0.5–0.8 | 稳健的长跑者 | 中性偏暖 |
| 0.25–0.5 | 平凡而真实 | 写实 |
| < 0.25 | 被生活暴击的人 | 自嘲式幽默，不羞辱用户 |

结局叙事文案 = 称号模板 + 本局影响最大的 1–2 个事件选择（按 |现金影响| + 修正的长期现值估算排序）拼接。模板放 `simulation/endings.ts`，文案风格见 PRODUCT.md 4.3。

### 4.4 边界情况

- 开局即 FIRE（initialAssets ≥ 开局目标线且 > 0）：**在初始化（createInitialState）阶段直接判定** `status = 'fire'`，`years = []`（空年度历史是合法且无歧义的初始表达，结局页读取 inputs 与初始目标线展示），不经历任何一年的投资损益与市场抽样。重播同 inputs + seed 时同样在初始化即终止，结果一致。
- 收入为 0：允许，纯吃老本剧本，公式自然退化。
- 资产为 0 且收入 ≤ 支出：第一年末即为负 → 走债务危机流程，不崩溃报错。

## 5. 事件系统

### 5.1 触发节奏（matcher 内控制，与事件内容解耦）

- 全局最小间隔 2 年；首个事件强制落在 yearIndex 2–4（优先从 career 池抽，建立代入感；无合格职业事件时回退到全部合格事件，仍无合格则顺延，不卡死）。
- 其余年份触发概率 `p = 0.15 + 0.05 × 距上次事件年数`，上限 0.5。期望每局 10–14 次。
- 抽取：过滤（年龄/资产门槛/flags/cooldown/once/当年市场收益门槛）→ 按 weight 加权随机（event:t 子流）。
- `forcedOnly` 事件（`startup-exit`、`debt-crisis`）不参与普通抽取：前者由 scheduleEvent 到期强制触发，后者在年末负资产且救援未用过时强制触发（含事件致负债的次年补救），均绕过概率。
- 市场事件的故事必须与当年真实行情一致：`bull-fever` 仅在当年 marketReturn ≥ +10% 可抽中，`market-crash` 仅在 ≤ −10% 可抽中（描述不写死具体跌幅）。
- `weightModifiers`：持有指定 flag 时权重倍乘（如 `health-risk` 使 `scam` 权重 ×3）。
- 破产救援事件绕过概率，强制触发。
- 事件抽取子流与市场子流隔离：改选事件不会改变市场序列（资产门槛变化导致的抽取差异是合理因果，属预期）。

### 5.2 首批事件清单（16 个）

金额均为名义值；`×` 表示乘数修正，`Δr` 表示收益率加数。实现时每个选项的 hint 文案必须由 effects 数值生成或静态校验一致。

**career（职业）**

| id | 触发 | 情境 | 选项与效果 |
|---|---|---|---|
| `startup-invite` | 25–45 岁，资产 ≥ 30 万，once | 朋友拉你合伙开咖啡店 | A 投 30 万：cash −300,000，setFlag `startup`（3 年后强制后续事件 `startup-exit`）；B 婉拒：无效果 |
| `startup-exit` | flag `startup`，3 年后强制 | 咖啡店到了清算/扩张路口 | A 扩张：cash −200,000，50% 概率（event 子流）3 年后 cash +1,200,000，否则血本无归（用延迟 cash 事件实现）；B 关店止损：cash +80,000，clearFlag |
| `promotion` | 24–50 岁，cooldown 8 | 升职机会，但要带团队常驻加班 | A 接受：incomeMult ×1.25 permanent，expenseMult ×1.08 permanent（应酬/健康）；B 拒绝：无效果 |
| `industry-winter` | 28–55 岁，cooldown 10 | 行业寒冬，裁员名单有你 | A 拿赔偿走人：cash +0.5×年收入，incomeMult ×0.7 持续 2 年；B 自费转行：cash −50,000，incomeMult ×1.15 permanent |

**family（家庭）**

| id | 触发 | 情境 | 选项与效果 |
|---|---|---|---|
| `marriage` | 24–40 岁，once | 你决定结婚 | A 办婚礼：cash −200,000，expenseMult ×1.15 permanent；B 旅行结婚：cash −50,000，expenseMult ×1.12 permanent |
| `newborn` | 26–42 岁，once | 孩子出生 | A 亲自带：cash −100,000，expenseMult ×1.30 持续 22 年；B 请育儿嫂：cash −100,000，expenseMult ×1.45 持续 18 年，incomeMult ×1.05 permanent（保住事业） |
| `parent-illness` | 35–60 岁，once | 父母生了一场大病 | A 全力治疗：cash −200,000；B 保守方案：cash −80,000，setFlag `regret`（结局文案素材） |
| `buy-house` | 资产 ≥ 80 万，once | 你看中了一套房 | A 上车：cash −600,000，expenseMult ×0.90 permanent（省房租），setFlag `homeowner`；B 继续租房：无效果 |

**market（市场）**

| id | 触发 | 情境 | 选项与效果 |
|---|---|---|---|
| `bull-fever` | cooldown 9，资产 ≥ 10 万 | 全民炒股，邻居都在晒收益 | A 加杠杆：Δr +0.08 持续 3 年，setFlag `leveraged` 持续 3 年（与 Δr 同期失效；期间 `crash` 事件对其现金惩罚翻倍）；B 不跟：无效果 |
| `market-crash` | cooldown 9，资产 ≥ 5 万 | 市场暴跌 30%，账户一片绿 | A 割肉离场：cash −15%×资产，Δr −0.02 持续 2 年（踏空）；B 躺平装死：无效果；C 逆势加仓：cash −20%×资产，Δr +0.03 持续 5 年 |
| `rate-cycle` | 30–70 岁，cooldown 12 | 利率下行，存款不再香 | A 转投债基：Δr −0.01 永久（v1 不做逐事件 σ，文案不得承诺波动降低）；B 维持原配置：无效果 |

**lifestyle（生活方式）**

| id | 触发 | 情境 | 选项与效果 |
|---|---|---|---|
| `lifestyle-creep` | cooldown 8 | 收入涨了，你想换更好的生活 | A 升级：expenseMult ×1.20 permanent；B 保持：无效果（提示「目标线随支出上涨」） |
| `relocate` | 24–40 岁，once | 外地高薪 offer | A 去：incomeMult ×1.30 permanent，expenseMult ×1.20 permanent；B 留下：无效果 |
| `health-warning` | 30–60 岁，once | 体检报告亮了红灯 | A 彻底改造：cash −30,000，expenseMult ×1.05 permanent，clearFlag `regret`；B 先忙工作：setFlag `health-risk`（后续 `shock` 池权重 +） |

**shock（黑天鹅）**

| id | 触发 | 情境 | 选项与效果 |
|---|---|---|---|
| `scam` | 资产 ≥ 20 万，once，weight 低 | 「稳赚」理财项目暴雷 | 单选项接受：cash −25%×资产 |
| `inheritance` | once，weight 极低 | 远房亲戚留下一笔遗产 | 单选项接受：cash +500,000 |

**救援事件**

| id | 触发 | 选项与效果 |
|---|---|---|
| `debt-crisis` | 年末净资产为负且未处理救援，强制 once；事件致负债次年补救 | A 极限节流：expenseMult ×0.6 持续 5 年；B 向家人求助：cash +100,000，setFlag `family-debt`；C 变卖一切：cash +30%×开局资产，incomeMult ×0.9 持续 3 年 |

### 5.3 事件实现约束

- 事件定义是**纯数据**，不含函数逻辑；延迟剧情用 `scheduleEvent`（到期强制触发 forcedOnly 事件），延迟现金用 `scheduledCash`（到期按概率子流结算），均为可序列化结构（`SimState.scheduledEvents/scheduledCash`），引擎不识别任何具体事件 id（救援入口仅按约定的 `debt-crisis` id 查找池内定义）。
- 概率型结果（startup-exit 的 50%）由引擎在应用效果时用 event 子流抽样，事件数据只声明 `{ type: 'cash', amount, probability }` 形式的可选字段（实现时在 EventEffect 的 cash 上加 `probability?: number`）。
- 新增事件 = 新增一条数据 + 测试，不改引擎。这是解耦的验收标准。

## 6. 蒙特卡洛多路径（P4-A 计算 / P4-B 展示）

- `runMonteCarlo(inputs, baseSeed, n=300, config?)`：第 i 条路径种子 `${baseSeed}:mc:${i}`，关闭全部人生事件（含债务救援），复用引擎的 `calculateFinancialYear`、目标线、FIRE 与破产判定，不复制年度公式。
- **完整年限基线**：每条路径结算 `endAge-startAge` 年，t=0…年数−1，年龄为 startAge…endAge−1；不额外计算 endAge 当年。FIRE 后仍继续工作、储蓄与投资；首次破产后也仅作数学上的负债续算，不免债、不置零、不冻结资产、不丢弃样本。分位带每年始终包含 n 条路径，不是退休提款模型，也不是破产后可实际执行的人生。
- **达成率与资产分布分开**：记录首次破产前（或开局）的首次 FIRE，破产后假设续算产生的达标不计成功。首次 FIRE 后再次跌破目标不撤销历史成功，后来破产仍独立记录。成功数+未达成数=n；破产数可能与成功数重叠，不能作为第三个互斥结局相加。
- **开局与年末分开**：`initial` 为未结算起点分布，`years` 为年末分布。首次时点含 `phase: initial | yearEnd`、yearIndex、calendarYear、age，避免开局即 FIRE 与 t=0 年末 FIRE 混淆。开局即 FIRE 仍推演完整基线，成功年龄为 startAge。
- **分位数**：升序样本的线性插值，h=(n−1)p，Q(p)=x[floor(h)]+(x[ceil(h)]−x[floor(h)])×小数部分。p10/p50/p90 及成功年龄中位数均用此法；无成功路径的中位年龄为 null。
- **边界**：n 必须为 1…10000 的整数，否则抛 RangeError（不返回虚假的零路径概率）；年限须为正整数，与普通局拒绝空年限一致；单路径的三条分位线相等。金额全为名义值，不提前四舍五入。数值溢出抛 RangeError，不静默夹断；默认与三策略下合法输入上界须通过有限数测试。
- **配对策略**：`runStrategyComparison` 使用相同 baseSeed、路径 i 与 `market:t` 标准正态子流，仅覆写 config 的 μ/σ；三档假设只定义在 config.ts。输出保持传入顺序，不按成功率排序，不假定进取最好。
- **当前人生比较**：`compareWithParallelLives(actual, result)` 取最后已结算快照（不取 pending 暂记），按同 yearIndex/calendarYear/age 匹配；空历史取独立 initial 分布。终点页跨入 endAge 的展示标签不用于错配到下一年。要求同起点输入；不匹配或空分布返回 null。百分位为 100×(严格小于的样本数+0.5×相等数)/样本数，另返回严格超过比例；「超过了 X%」须用严格超过比例，平局中位秩只能称为百分位。
- **解释边界**：这是指定假设、无事件基线下的模型内比较，不代表真实人群排名或现实概率；实际人生含事件，不能把两者差额都归因于投资选择。
- **纯函数与性能**：结果保留路径快照、升序样本、分位带、首次时点与分布，便于审计与 P4-B 接入；不包含耗时。调用层用 performance.now() 测量多次 300×72 步，目标 <300ms；实测明显阻塞再考虑 Worker。P4-A 不接入 UI。

## 7. 一致性测试清单（Vitest 必须覆盖）

1. **确定性**：同 inputs + seed + choices，两次 `replay` 逐年深相等。
2. **守恒**：无事件年 `ΔW = W·r + income − expenses`（负债年用 d）。
3. **通胀口径**：任意年 `toReal(nominal) × (1+π)^t == nominal`；manual 目标线第 t 年 = amount × (1+π)^t。
4. **子流隔离**：固定 seed，改变某年事件选择，其余年份 `marketReturn` 序列不变。
5. **修正生命周期**：duration 修正恰好在到期年失效；permanent 不失效；叠乘/叠加顺序无关。
6. **判定边界**：恰好等于目标线判 FIRE；连续 5 年负资产判崩溃；开局即 FIRE 彩蛋分支。
7. **事件门槛**：资产/年龄/flag/cooldown/once 过滤逐一断言；debt-crisis 强制触发。
8. **截断重播**：choices 前缀重播结果与完整重播的对应前缀一致（「回到关键抉择」的正确性基础）。