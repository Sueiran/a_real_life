import type { EventDef } from '../../simulation/types';

export const lifestyleEvents: EventDef[] = [
  {
    id: 'lifestyle-creep',
    category: 'lifestyle',
    weight: 8,
    minAge: 18,
    maxAge: 90,
    cooldownYears: 8,
    once: false,
    title: '想对自己好一点',
    description: '收入涨了，你开始看更好的房子、更贵的餐厅。朋友都说，过得精致一点没错。',
    choices: [
      {
        id: 'upgrade',
        label: '升级生活，犒劳自己',
        hint: '年支出 ×1.20 永久，自由目标随支出上涨',
        effects: [{ type: 'expenseMult', factor: 1.2, durationYears: 'permanent' }],
      },
      {
        id: 'keep',
        label: '保持节奏，把钱留下',
        hint: '维持支出，离目标更近',
        effects: [],
      },
    ],
  },
  {
    id: 'relocate',
    category: 'lifestyle',
    weight: 5,
    minAge: 24,
    maxAge: 40,
    cooldownYears: 0,
    once: true,
    title: '外地的高薪 offer',
    description: '另一座城市给了你无法拒绝的薪水，代价是离开熟悉的朋友圈，一切重新开始。',
    choices: [
      {
        id: 'go',
        label: '去，趁年轻闯一次',
        hint: '年收入 ×1.30 永久，年支出 ×1.20 永久',
        effects: [
          { type: 'incomeMult', factor: 1.3, durationYears: 'permanent' },
          { type: 'expenseMult', factor: 1.2, durationYears: 'permanent' },
        ],
      },
      {
        id: 'stay',
        label: '留下，守住熟悉的生活',
        hint: '维持现状，不换城市',
        effects: [],
      },
    ],
  },
  {
    id: 'health-warning',
    category: 'lifestyle',
    weight: 6,
    minAge: 30,
    maxAge: 60,
    cooldownYears: 0,
    once: true,
    title: '体检报告亮了红灯',
    description: '医生指着报告上的几个箭头，说再这样下去会出大问题。改变，从来都不便宜。',
    choices: [
      {
        id: 'change',
        label: '彻底改造生活方式',
        hint: '现在 -¥30,000，年支出 ×1.05 永久（健康管理）',
        effects: [
          { type: 'cash', amount: -30000 },
          { type: 'expenseMult', factor: 1.05, durationYears: 'permanent' },
          { type: 'clearFlag', flag: 'regret' },
        ],
      },
      {
        id: 'busy',
        label: '先忙工作，以后再说',
        hint: '现在不花钱，但未来意外风险上升',
        effects: [{ type: 'setFlag', flag: 'health-risk' }],
      },
    ],
  },
];
