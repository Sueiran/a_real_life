import { describe, expect, it } from 'vitest';
import { EVENT_POOL } from '../events/definitions';
import type { EventDef, EventEffect } from '../simulation/types';

function moneyToken(amount: number): string {
  return `${amount >= 0 ? '+' : '-'}¥${Math.abs(amount).toLocaleString('en-US')}`;
}

function effectTokens(effect: EventEffect): string[] {
  switch (effect.type) {
    case 'cash':
      return [moneyToken(effect.amount)];
    case 'cashRelative': {
      const pct = `${Math.abs(effect.ratio) * 100}%`;
      const basis = effect.basis === 'annualIncome' ? '收入' : effect.basis === 'initialAssets' ? '开局资产' : '资产';
      return [pct, basis];
    }
    case 'incomeMult':
    case 'expenseMult': {
      const dur = effect.durationYears === 'permanent' ? '永久' : `持续 ${effect.durationYears} 年`;
      return [String(effect.factor), dur];
    }
    case 'returnDelta': {
      const dur = effect.durationYears === 'permanent' ? '永久' : `持续 ${effect.durationYears} 年`;
      return [`${Math.abs(effect.delta) * 100}%`, dur];
    }
    case 'scheduleEvent':
      return [`${effect.afterYears} 年后`];
    case 'scheduledCash': {
      const tokens = [moneyToken(effect.amount), `${effect.afterYears} 年后`];
      if (effect.probability !== undefined) tokens.push(`${effect.probability * 100}%`);
      return tokens;
    }
    default:
      return [];
  }
}

describe('事件数据完整性', () => {
  it('事件池共 17 个事件（16 常规 + 1 救援）', () => {
    expect(EVENT_POOL).toHaveLength(17);
    expect(EVENT_POOL.filter((e) => e.id === 'debt-crisis')).toHaveLength(1);
  });

  it('每个事件 id 唯一', () => {
    const ids = EVENT_POOL.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每个事件有标题、≤60 字描述、至少 1 个选项', () => {
    for (const def of EVENT_POOL) {
      expect(def.title.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.description.length).toBeLessThanOrEqual(60);
      expect(def.choices.length).toBeGreaterThanOrEqual(1);
      expect(def.choices.length).toBeLessThanOrEqual(3);
    }
  });

  it('scheduleEvent 引用的目标事件存在于池中', () => {
    for (const def of EVENT_POOL) {
      for (const choice of def.choices) {
        for (const effect of choice.effects) {
          if (effect.type === 'scheduleEvent') {
            expect(EVENT_POOL.some((e) => e.id === effect.eventId)).toBe(true);
          }
        }
      }
    }
  });
});

describe('选项 hint 与 effects 数值一致性（静态校验）', () => {
  it.each(EVENT_POOL.flatMap((def: EventDef) =>
    def.choices.map((c) => ({ event: def.id, choice: c.id, hint: c.hint, effects: c.effects })),
  ))('$event / $choice 的 hint 覆盖全部效果数值', ({ hint, effects }) => {
    for (const effect of effects) {
      // 条件追加效果与主效果同值时，hint 共用同一文案（如暴跌加杠杆翻倍）。
      for (const token of effectTokens(effect)) {
        expect(hint, `hint「${hint}」缺少数值「${token}」`).toContain(token);
      }
    }
  });
});
