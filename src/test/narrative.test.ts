import { describe, expect, it } from 'vitest';
import { buildNarrative } from '../views/ending/narrative';
import { summarizeEnding } from '../simulation/endings';
import { EVENT_POOL } from '../events/definitions';
import { baseInputs, flatConfig, simulateAll } from './fixtures';

describe('结局叙事只引用真实发生的事件', () => {
  it('引用的每个事件都存在于历史中，且选项一致', () => {
    const sim = simulateAll(baseInputs(), 'narrative-seed', { pool: EVENT_POOL });
    const ending = summarizeEnding(sim)!;
    const narrative = buildNarrative(sim, ending);
    expect(narrative.referencedEvents.length).toBeGreaterThan(0);
    for (const ref of narrative.referencedEvents) {
      const y = sim.years.find((v) => v.yearIndex === ref.yearIndex);
      expect(y).toBeDefined();
      expect(y!.eventId).toBe(ref.eventId);
      expect(y!.choiceId).toBe(ref.choiceId);
    }
  });

  it('转折点是现金影响绝对值最大的真实事件年', () => {
    const sim = simulateAll(baseInputs(), 'narrative-seed', { pool: EVENT_POOL });
    const ending = summarizeEnding(sim)!;
    const narrative = buildNarrative(sim, ending);
    const impacts = sim.years
      .filter((y) => y.eventId !== null)
      .map((y) => Math.abs((y.eventCash ?? 0) + (y.scheduledCashApplied ?? 0)));
    const max = Math.max(...impacts);
    expect(Math.abs(narrative.turning!.cashImpact)).toBe(max);
    expect(narrative.turningText).toContain(String(narrative.turning!.calendarYear));
  });

  it('故事句包含真实年份与当时的选项文案', () => {
    const sim = simulateAll(baseInputs(), 'narrative-seed', { pool: EVENT_POOL });
    const ending = summarizeEnding(sim)!;
    const narrative = buildNarrative(sim, ending);
    for (const line of narrative.story) {
      const ref = narrative.referencedEvents.find((e) => line.includes(String(e.calendarYear)) && line.includes(e.choiceLabel));
      expect(ref).toBeDefined();
    }
  });

  it('开局即 FIRE：无事件引用，彩蛋文案', () => {
    const sim = simulateAll(baseInputs({ initialAssets: 1e9 }), 'init-fire', { pool: EVENT_POOL });
    const ending = summarizeEnding(sim)!;
    expect(ending.title).toBe('你本来就自由了');
    const narrative = buildNarrative(sim, ending);
    expect(narrative.turning).toBeNull();
    expect(narrative.story).toEqual([]);
    expect(narrative.referencedEvents).toEqual([]);
    expect(narrative.opening).toContain('终点线');
  });

  it('无事件局：叙事不虚构任何故事', () => {
    const sim = simulateAll(baseInputs({ endAge: 34 }), 'quiet', { config: flatConfig(), pool: [] });
    const ending = summarizeEnding(sim)!;
    const narrative = buildNarrative(sim, ending);
    expect(narrative.turning).toBeNull();
    expect(narrative.turningText).toBeNull();
    expect(narrative.story).toEqual([]);
    expect(narrative.opening).toContain('4 年');
  });

  it('破产结局：文案带希望不带嘲讽，引用真实事件', () => {
    const sim = simulateAll(
      baseInputs({ initialAssets: 0, annualIncome: 50000, annualExpenses: 200000 }),
      'bankrupt-seed',
      { pool: EVENT_POOL },
    );
    const ending = summarizeEnding(sim)!;
    expect(ending.status).toBe('bankrupt');
    const narrative = buildNarrative(sim, ending);
    expect(narrative.opening).toBe('账户清零的那一刻，人生并没有清零。');
    expect(narrative.closing).toBe('破产是这一局的终点，不是你的。');
    for (const ref of narrative.referencedEvents) {
      expect(sim.years.some((y) => y.yearIndex === ref.yearIndex && y.eventId === ref.eventId)).toBe(true);
    }
  });
});