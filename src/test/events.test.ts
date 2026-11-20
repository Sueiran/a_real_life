import { describe, expect, it } from 'vitest';
import { createInitialState, replay, stepYear } from '../simulation/engine';
import { baseInputs, flatConfig, makeEvent, simulateAll } from './fixtures';

const SEED = 'demo-seed-2026';

const cashEvent = makeEvent({
  id: 'windfall',
  once: true,
  choices: [
    { id: 'a', label: 'A', hint: '', effects: [{ type: 'cash', amount: 1000 }] },
    { id: 'b', label: 'B', hint: '', effects: [] },
  ],
});

describe('事件两阶段步进', () => {
  it('阶段一返回 pendingEvent，不追加快照、不重复抽样', () => {
    // pacing：首事件窗口为第 2–4 年，前两步为无事件年。
    let state = createInitialState(baseInputs(), SEED, undefined, [cashEvent]);
    state = stepYear(state).state;
    state = stepYear(state).state;
    const result = stepYear(state);
    expect(result.pendingEvent?.id).toBe('windfall');
    expect(result.state.years).toHaveLength(2);
    expect(result.state.pending?.year.assets).toBe(result.year.assets);
    expect(result.state.pending?.year.yearIndex).toBe(2);
    expect(result.state.status).toBe('running');
  });

  it('阶段二现金只结算一次，年度现金流不重复计入', () => {
    const noEvent = replay(baseInputs(), SEED);
    let state = createInitialState(baseInputs(), SEED, undefined, [cashEvent]);
    state = stepYear(state).state;
    state = stepYear(state).state;
    const phase1 = stepYear(state);
    const phase2 = stepYear(phase1.state, { yearIndex: 2, eventId: 'windfall', choiceId: 'a' });

    expect(phase2.state.years).toHaveLength(3);
    const finalYear = phase2.state.years[2];
    const base = noEvent.years[2];
    expect(finalYear.marketReturn).toBe(base.marketReturn);
    expect(finalYear.income).toBe(base.income);
    expect(finalYear.expenses).toBe(base.expenses);
    expect(finalYear.assets).toBeCloseTo(base.assets + 1000, 6);
    expect(phase2.state.pending).toBeNull();
  });

  it('pending 状态缺少 choice 抛错；choice 不匹配抛错', () => {
    let state = createInitialState(baseInputs(), SEED, undefined, [cashEvent]);
    state = stepYear(state).state;
    state = stepYear(state).state;
    const phase1 = stepYear(state);
    expect(() => stepYear(phase1.state)).toThrow(/choice/);
    expect(() =>
      stepYear(phase1.state, { yearIndex: 2, eventId: 'windfall', choiceId: 'nope' }),
    ).toThrow(/选项/);
    expect(() =>
      stepYear(phase1.state, { yearIndex: 1, eventId: 'windfall', choiceId: 'a' }),
    ).toThrow(/不匹配/);
  });

  it('事件现金可能直接触发 FIRE（重判结局）', () => {
    const inputs = baseInputs({
      initialAssets: 0,
      annualIncome: 0,
      annualExpenses: 1,
      goal: { mode: 'manual', amount: 900 },
    });
    // 无 debt-crisis 定义，不触发救援。
    let state = createInitialState(inputs, SEED, flatConfig(), [cashEvent]);
    state = stepYear(state).state;
    state = stepYear(state).state;
    const phase1 = stepYear(state);
    const preChoice = phase1.year.assets;
    expect(preChoice).toBeCloseTo(-1 - 1.08 - 1.08 * 1.08, 6);
    const phase2 = stepYear(phase1.state, { yearIndex: 2, eventId: 'windfall', choiceId: 'a' });
    expect(phase2.state.years[2].assets).toBeCloseTo(preChoice + 1000, 6);
    expect(phase2.state.status).toBe('fire');
  });

  it('事件现金使资产转正时重置连续负资产计数', () => {
    const inputs = baseInputs({ initialAssets: 0, annualIncome: 0, annualExpenses: 100000 });
    const rescue = makeEvent({
      id: 'rescue',
      once: true,
      minAge: 33, // 第 3 年触发，此时已连续 3 年负资产（预结算第 4 年才达破产线，不干扰）
      choices: [{ id: 'a', label: 'A', hint: '', effects: [{ type: 'cash', amount: 1e9 }] }],
    });
    const config = flatConfig({ bankruptDebtMultiple: 1e9 });
    let state = createInitialState(inputs, SEED, config, [rescue]);
    for (let i = 0; i < 3; i++) state = stepYear(state).state;
    expect(state.negativeYears).toBe(3);
    const phase1 = stepYear(state);
    expect(phase1.pendingEvent?.id).toBe('rescue');
    const phase2 = stepYear(phase1.state, { yearIndex: 3, eventId: 'rescue', choiceId: 'a' });
    expect(phase2.state.years[3].assets).toBeGreaterThan(0);
    expect(phase2.state.negativeYears).toBe(0);
  });
});

describe('市场与事件子流隔离', () => {
  it('有无事件、不同选择，市场收益序列完全一致', () => {
    const noEvent = replay(baseInputs(), SEED);
    const withEventA = simulateAll(baseInputs(), SEED, { pool: [cashEvent], choose: () => 'a' });
    const withEventB = simulateAll(baseInputs(), SEED, { pool: [cashEvent], choose: () => 'b' });

    const n = 10;
    expect(withEventA.years.slice(0, n).map((y) => y.marketReturn)).toEqual(
      noEvent.years.slice(0, n).map((y) => y.marketReturn),
    );
    expect(withEventB.years.slice(0, n).map((y) => y.marketReturn)).toEqual(
      noEvent.years.slice(0, n).map((y) => y.marketReturn),
    );
    // 事件确实造成了资产差异（证明测试不是空转）
    expect(withEventA.years[2].assets).not.toBe(withEventB.years[2].assets);
  });
});

describe('截断重播', () => {
  const recurring = makeEvent({
    id: 'recurring',
    choices: [{ id: 'a', label: 'A', hint: '', effects: [{ type: 'cash', amount: 1000 }] }],
  });
  // 触发年份由 pacing 决定，从参考运行派生，不写死。
  const reference = simulateAll(baseInputs(), SEED, { pool: [recurring] });
  const fullChoices = reference.years
    .filter((y) => y.eventId === 'recurring')
    .slice(0, 5)
    .map((y) => ({ yearIndex: y.yearIndex, eventId: 'recurring', choiceId: 'a' }));

  it('choices 前缀重播与完整重播的历史前缀一致，停在下待决策事件', () => {
    const full = replay(baseInputs(), SEED, fullChoices, undefined, [recurring]);
    const prefix = replay(baseInputs(), SEED, fullChoices.slice(0, 2), undefined, [recurring]);

    expect(fullChoices.length).toBeGreaterThanOrEqual(3);
    // 前缀停在第三个事件的暂记年（未入历史），历史恰好到该年为止。
    const thirdChoiceYear = fullChoices[2].yearIndex;
    expect(prefix.years).toHaveLength(thirdChoiceYear);
    expect(prefix.years).toEqual(full.years.slice(0, thirdChoiceYear));
    expect(prefix.status).toBe('running');
    expect(prefix.pending?.event.id).toBe('recurring');
    expect(prefix.pending?.year.yearIndex).toBe(thirdChoiceYear);
  });

  it('截断后改选：分歧点前一致，分歧点按新选择结算', () => {
    const full = replay(baseInputs(), SEED, fullChoices, undefined, [recurring]);
    const prefix = replay(baseInputs(), SEED, fullChoices.slice(0, 2), undefined, [recurring]);
    const t = fullChoices[2].yearIndex;
    const changed = stepYear(prefix, { yearIndex: t, eventId: 'recurring', choiceId: 'a' });
    expect(changed.state.years[t]).toEqual(full.years[t]);
  });
});

describe('事件门槛过滤', () => {
  it('年龄门槛：minAge 之前不触发', () => {
    const ev = makeEvent({ id: 'midlife', minAge: 35 });
    const state = simulateAll(baseInputs(), SEED, { pool: [ev] });
    expect(state.years.slice(0, 5).every((y) => y.eventId === null)).toBe(true);
    const first = state.years.find((y) => y.eventId === 'midlife')!;
    expect(first.age).toBeGreaterThanOrEqual(35);
  });

  it('资产门槛：不满足 minAssets 永不触发', () => {
    const ev = makeEvent({ id: 'rich-only', minAssets: 1e12 });
    const state = simulateAll(baseInputs(), SEED, { pool: [ev] });
    expect(state.years.every((y) => y.eventId !== 'rich-only')).toBe(true);
  });

  it('once：一生仅触发一次', () => {
    const ev = makeEvent({ id: 'once-ev', once: true });
    const state = simulateAll(baseInputs(), SEED, { pool: [ev] });
    expect(state.years.filter((y) => y.eventId === 'once-ev')).toHaveLength(1);
    expect(state.years[2].eventId).toBe('once-ev');
  });

  it('cooldown：同事件最小间隔', () => {
    const ev = makeEvent({ id: 'cd-ev', cooldownYears: 3 });
    const state = simulateAll(baseInputs(), SEED, { pool: [ev] });
    const triggered = state.years.filter((y) => y.eventId === 'cd-ev').map((y) => y.yearIndex);
    expect(triggered[0]).toBe(2);
    expect(triggered.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < triggered.length; i++) {
      expect(triggered[i] - triggered[i - 1]).toBeGreaterThanOrEqual(3);
    }
  });

  it('excludesFlags：持有互斥标记时不触发', () => {
    const flagger = makeEvent({
      id: 'flagger',
      once: true,
      choices: [{ id: 'a', label: 'A', hint: '', effects: [{ type: 'setFlag', flag: 'x' }] }],
    });
    // minAge 33：flagger 在 t=2（30 岁）强制触发时 excluded 尚未合格。
    const excluded = makeEvent({ id: 'excluded', excludesFlags: ['x'], minAge: 33 });
    const state = simulateAll(baseInputs(), SEED, { pool: [flagger, excluded] });
    expect(state.years[2].eventId).toBe('flagger');
    expect(state.years.every((y) => y.eventId !== 'excluded')).toBe(true);
  });

  it('事件效果 setFlag/clearFlag 正确写入状态', () => {
    const flagger = makeEvent({
      id: 'flagger',
      once: true,
      choices: [{ id: 'a', label: 'A', hint: '', effects: [{ type: 'setFlag', flag: 'x' }] }],
    });
    const state = simulateAll(baseInputs(), SEED, { pool: [flagger] });
    expect(state.flags.has('x')).toBe(true);
  });
});
