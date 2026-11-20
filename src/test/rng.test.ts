import { describe, expect, it } from 'vitest';
import { createRng } from '../simulation/rng';

describe('确定性 RNG', () => {
  it('相同 seed + domain 产生完全一致的序列', () => {
    const a = createRng('seed-1', 'market:0');
    const b = createRng('seed-1', 'market:0');
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('不同 domain 子流相互隔离', () => {
    const market = createRng('seed-1', 'market:0');
    const event = createRng('seed-1', 'event:0');
    const marketSeq = Array.from({ length: 10 }, () => market.next());
    const eventSeq = Array.from({ length: 10 }, () => event.next());
    expect(marketSeq).not.toEqual(eventSeq);
  });

  it('不同 seed 产生不同序列', () => {
    const a = createRng('seed-1', 'market:0');
    const b = createRng('seed-2', 'market:0');
    expect(a.next()).not.toBe(b.next());
  });

  it('normal() 同 seed/domain 可复现', () => {
    const a = createRng('seed-1', 'market:3');
    const b = createRng('seed-1', 'market:3');
    for (let i = 0; i < 50; i++) expect(a.normal()).toBe(b.normal());
  });

  it('Box–Muller 正态样本均值与标准差合理', () => {
    const rng = createRng('seed-1', 'market:0');
    const samples = Array.from({ length: 20000 }, () => rng.normal());
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length;
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.sqrt(variance)).toBeGreaterThan(0.9);
    expect(Math.sqrt(variance)).toBeLessThan(1.1);
  });
});
