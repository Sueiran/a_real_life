import type { EventDef } from '../../simulation/types';

export const familyEvents: EventDef[] = [
  {
    id: 'marriage',
    category: 'family',
    weight: 8,
    minAge: 24,
    maxAge: 40,
    cooldownYears: 0,
    once: true,
    title: '你决定结婚了',
    description: '两个人商量了一晚上：是办一场像样的婚礼，还是把钱省下来去旅行？',
    choices: [
      {
        id: 'wedding',
        label: '办一场像样的婚礼',
        hint: '现在 -¥200,000，年支出 ×1.15 永久（共同生活）',
        effects: [
          { type: 'cash', amount: -200000 },
          { type: 'expenseMult', factor: 1.15, durationYears: 'permanent' },
        ],
      },
      {
        id: 'travel',
        label: '旅行结婚，从简',
        hint: '现在 -¥50,000，年支出 ×1.12 永久',
        effects: [
          { type: 'cash', amount: -50000 },
          { type: 'expenseMult', factor: 1.12, durationYears: 'permanent' },
        ],
      },
    ],
  },
  {
    id: 'newborn',
    category: 'family',
    weight: 6,
    minAge: 26,
    maxAge: 42,
    cooldownYears: 0,
    once: true,
    title: '孩子出生了',
    description: '凌晨三点，你抱着这个小小的生命。接下来的十几年，时间和金钱都要重新分配。',
    choices: [
      {
        id: 'self',
        label: '自己带，牺牲一部分事业',
        hint: '现在 -¥100,000，年支出 ×1.30 持续 22 年',
        effects: [
          { type: 'cash', amount: -100000 },
          { type: 'expenseMult', factor: 1.3, durationYears: 22 },
        ],
      },
      {
        id: 'nanny',
        label: '请育儿嫂，保住事业',
        hint: '现在 -¥100,000，年支出 ×1.45 持续 18 年，年收入 ×1.05 永久',
        effects: [
          { type: 'cash', amount: -100000 },
          { type: 'expenseMult', factor: 1.45, durationYears: 18 },
          { type: 'incomeMult', factor: 1.05, durationYears: 'permanent' },
        ],
      },
    ],
  },
  {
    id: 'parent-illness',
    category: 'family',
    weight: 6,
    minAge: 35,
    maxAge: 60,
    cooldownYears: 0,
    once: true,
    title: '父母病倒了',
    description: '父亲的检查报告出来了，医生给了两个方案。电话那头，母亲说别太花钱。',
    choices: [
      {
        id: 'best',
        label: '用最好的方案，全力治疗',
        hint: '现在 -¥200,000，不留遗憾',
        effects: [{ type: 'cash', amount: -200000 }],
      },
      {
        id: 'conservative',
        label: '选择保守方案',
        hint: '现在 -¥80,000，心里总会放不下',
        effects: [
          { type: 'cash', amount: -80000 },
          { type: 'setFlag', flag: 'regret' },
        ],
      },
    ],
  },
  {
    id: 'buy-house',
    category: 'family',
    weight: 6,
    minAge: 18,
    maxAge: 90,
    cooldownYears: 0,
    once: true,
    minAssets: 800000,
    title: '你看中了一套房',
    description: '中介说这套房子朝向好、学区稳。首付掏空大半积蓄，但从此不用再看房东脸色。',
    choices: [
      {
        id: 'buy',
        label: '上车，安家',
        hint: '现在 -¥600,000，年支出 ×0.90 永久（省房租）',
        effects: [
          { type: 'cash', amount: -600000 },
          { type: 'expenseMult', factor: 0.9, durationYears: 'permanent' },
          { type: 'setFlag', flag: 'homeowner' },
        ],
      },
      {
        id: 'rent',
        label: '继续租房，保持灵活',
        hint: '不动用资产，房租照付',
        effects: [],
      },
    ],
  },
];
