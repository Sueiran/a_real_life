import type { EventDef } from '../../simulation/types';

export const careerEvents: EventDef[] = [
  {
    id: 'startup-invite',
    category: 'career',
    weight: 4,
    minAge: 25,
    maxAge: 45,
    cooldownYears: 0,
    once: true,
    minAssets: 300000,
    title: '朋友邀你开咖啡店',
    description: '老友想辞职开咖啡店，拉你入伙。他说配方研究了三年，就差你的启动资金。',
    choices: [
      {
        id: 'invest',
        label: '投 30 万，一起干',
        hint: '现在 -¥300,000，3 年后清算，盈亏未知',
        effects: [
          { type: 'cash', amount: -300000 },
          { type: 'setFlag', flag: 'startup' },
          { type: 'scheduleEvent', eventId: 'startup-exit', afterYears: 3 },
        ],
      },
      {
        id: 'decline',
        label: '婉拒，继续上班',
        hint: '保留现有资产，错过这次机会',
        effects: [],
      },
    ],
  },
  {
    id: 'startup-exit',
    category: 'career',
    weight: 0,
    minAge: 0,
    maxAge: 200,
    cooldownYears: 0,
    once: false,
    forcedOnly: true,
    title: '咖啡店走到了路口',
    description: '三年过去，咖啡店终于站稳了脚跟。是趁势扩张，还是见好就收？',
    choices: [
      {
        id: 'expand',
        label: '再投 20 万扩张',
        hint: '现在 -¥200,000，50% 概率 3 年后 +¥1,200,000，失败则无回报',
        effects: [
          { type: 'cash', amount: -200000 },
          { type: 'scheduledCash', amount: 1200000, afterYears: 3, probability: 0.5 },
          { type: 'clearFlag', flag: 'startup' },
        ],
      },
      {
        id: 'close',
        label: '关店止损，拿回分红',
        hint: '现在 +¥80,000，落袋为安',
        effects: [
          { type: 'cash', amount: 80000 },
          { type: 'clearFlag', flag: 'startup' },
        ],
      },
    ],
  },
  {
    id: 'promotion',
    category: 'career',
    weight: 10,
    minAge: 24,
    maxAge: 50,
    cooldownYears: 8,
    once: false,
    title: '升职的机会来了',
    description: '领导想提拔你带团队，薪水涨一截，代价是常驻加班和躲不掉的应酬。',
    choices: [
      {
        id: 'accept',
        label: '接受升职',
        hint: '年收入 ×1.25 永久，年支出 ×1.08 永久',
        effects: [
          { type: 'incomeMult', factor: 1.25, durationYears: 'permanent' },
          { type: 'expenseMult', factor: 1.08, durationYears: 'permanent' },
        ],
      },
      {
        id: 'decline',
        label: '婉拒，保住生活',
        hint: '维持现状，时间留给自己',
        effects: [],
      },
    ],
  },
  {
    id: 'industry-winter',
    category: 'career',
    weight: 6,
    minAge: 28,
    maxAge: 55,
    cooldownYears: 10,
    once: false,
    title: '行业寒冬，裁员有你',
    description: '公司开始裁员，你的名字在名单上。赔偿可以拿，但下一份工作不会好找。',
    choices: [
      {
        id: 'severance',
        label: '拿赔偿，休息再战',
        hint: '+50% 当年收入，年收入 ×0.7 持续 2 年',
        effects: [
          { type: 'cashRelative', basis: 'annualIncome', ratio: 0.5 },
          { type: 'incomeMult', factor: 0.7, durationYears: 2 },
        ],
      },
      {
        id: 'retrain',
        label: '自费转行，从头开始',
        hint: '现在 -¥50,000，年收入 ×1.15 永久',
        effects: [
          { type: 'cash', amount: -50000 },
          { type: 'incomeMult', factor: 1.15, durationYears: 'permanent' },
        ],
      },
    ],
  },
];
