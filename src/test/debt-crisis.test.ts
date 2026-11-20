import { describe, expect, it } from 'vitest';
import { createInitialState, stepYear } from '../simulation/engine';
import { baseInputs, flatConfig } from './fixtures';
import { EVENT_POOL, eventById } from '../events/definitions';

const SEED = 'demo-seed-2026';
const RESCUE = eventById('debt-crisis')!;

// 负资产开局：无收入、高支出，第一年即转负。
const poorInputs = baseInputs({ initialAssets: 0, annualIncome: 0, annualExpenses: 100000 });
const config = flatConfig({ bankruptDebtMultiple: 1e9 }); // 排除债务失控分支，专测救援

describe('债务救援优先级', () => {
  it('首次负资产年挂起 debt-crisis，而非直接累计破产计数', () => {
    const state = createInitialState(poorInputs, SEED, config, EVENT_POOL);
    const result = stepYear(state);
    expect(result.pendingEvent?.id).toBe('debt-crisis');
    expect(result.year.assets).toBeLessThan(0);
    expect(result.state.status).toBe('running');
    expect(result.state.years).toHaveLength(0);
  });

  it('救援选项「家人帮助」使资产转正，不破产', () => {
    let state = createInitialState(poorInputs, SEED, config, EVENT_POOL);
    const phase1 = stepYear(state);
    const phase2 = stepYear(phase1.state, { yearIndex: 0, eventId: 'debt-crisis', choiceId: 'family' });
    expect(phase2.state.years[0].assets).toBeCloseTo(0, 6); // -100000 + 100000
    expect(phase2.state.negativeYears).toBe(0);
    expect(phase2.state.status).toBe('running');
    expect(phase2.state.flags.has('family-debt')).toBe(true);
  });

  it('救援选项「极限节流」从次年起支出 ×0.6', () => {
    let state = createInitialState(poorInputs, SEED, config, EVENT_POOL);
    const phase1 = stepYear(state);
    let next = stepYear(phase1.state, { yearIndex: 0, eventId: 'debt-crisis', choiceId: 'austerity' }).state;
    next = stepYear(next).state;
    expect(next.years[1].expenses).toBeCloseTo(60000, 6);
  });

  it('救援后仍无力回天：连续负资产最终破产，不重复救援', () => {
    // 收入 0、支出 100000，节流也无法转正（收入 0），最终连续 5 年破产。
    // 只用救援事件池，排除其他剧情干扰。
    let state = createInitialState(poorInputs, SEED, config, [RESCUE]);
    let guard = 0;
    while (state.status === 'running' && guard++ < 30) {
      if (state.pending) {
        const { year, event } = state.pending;
        state = stepYear(state, { yearIndex: year.yearIndex, eventId: event.id, choiceId: 'austerity' }).state;
      } else {
        state = stepYear(state).state;
      }
    }
    expect(state.status).toBe('bankrupt');
    const rescues = state.years.filter((y) => y.eventId === 'debt-crisis');
    expect(rescues).toHaveLength(1);
  });

  it('救援只用一次：再次转负不重复触发', () => {
    // 家人帮助 +100000 转正，但收入 0 支出 100000，次年又转负。
    let state = createInitialState(poorInputs, SEED, config, [RESCUE]);
    let guard = 0;
    while (state.status === 'running' && guard++ < 30) {
      if (state.pending) {
        const { year, event } = state.pending;
        state = stepYear(state, { yearIndex: year.yearIndex, eventId: event.id, choiceId: 'family' }).state;
      } else {
        state = stepYear(state).state;
      }
    }
    expect(state.status).toBe('bankrupt');
    expect(state.years.filter((y) => y.eventId === 'debt-crisis')).toHaveLength(1);
  });

  it('结局之后不再触发任何事件', () => {
    // 极高收入开局直接 FIRE：不应有任何事件年。
    const rich = baseInputs({ initialAssets: 3000000 });
    const state = createInitialState(rich, SEED, config, EVENT_POOL);
    expect(state.status).toBe('fire');
    expect(state.years).toHaveLength(0);
    expect(state.pending).toBeNull();
  });
});
