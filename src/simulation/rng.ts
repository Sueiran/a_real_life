export interface Rng {
  next(): number;
  normal(): number;
}

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// domain 子流隔离：market:t 与 event:t 互不干扰，改选事件不改变市场序列。
export function createRng(seed: string, domain: string): Rng {
  const seedHash = xmur3(`${seed}::${domain}`);
  const next = mulberry32(seedHash());
  return {
    next,
    normal() {
      // Box–Muller，丢弃第二个样本以保持无内部缓存的纯序列语义。
      let u1 = next();
      while (u1 <= Number.EPSILON) u1 = next();
      const u2 = next();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    },
  };
}
