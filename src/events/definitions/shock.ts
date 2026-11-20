import type { EventDef } from '../../simulation/types';

export const shockEvents: EventDef[] = [
  {
    id: 'scam',
    category: 'shock',
    weight: 1.5,
    minAge: 18,
    maxAge: 90,
    cooldownYears: 0,
    once: true,
    minAssets: 200000,
    weightModifiers: [{ flag: 'health-risk', multiplier: 3 }],
    title: '「稳赚」项目暴雷了',
    description: '那个承诺年化 30% 的理财项目跑路了。当初拉你进群的人，现在也联系不上。',
    choices: [
      {
        id: 'accept',
        label: '认栽，吸取教训',
        hint: '现在 -25% 当前资产',
        effects: [{ type: 'cashRelative', basis: 'assetsNow', ratio: -0.25 }],
      },
    ],
  },
  {
    id: 'inheritance',
    category: 'shock',
    weight: 0.5,
    minAge: 18,
    maxAge: 90,
    cooldownYears: 0,
    once: true,
    title: '一笔意外的遗产',
    description: '一位几乎没见过面的远房亲戚，在遗嘱里给你留了一笔钱。律师打来电话时，你以为是诈骗。',
    choices: [
      {
        id: 'accept',
        label: '接受这份馈赠',
        hint: '现在 +¥500,000',
        effects: [{ type: 'cash', amount: 500000 }],
      },
    ],
  },
];
