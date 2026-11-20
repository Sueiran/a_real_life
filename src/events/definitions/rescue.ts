import type { EventDef } from '../../simulation/types';

export const rescueEvents: EventDef[] = [
  {
    id: 'debt-crisis',
    category: 'debt-crisis',
    weight: 0,
    minAge: 0,
    maxAge: 200,
    cooldownYears: 0,
    once: true,
    forcedOnly: true,
    title: '账户第一次见底了',
    description: '这一年结束，你的净资产变成了负数。接下来的决定，会真正影响你往后的生活。',
    choices: [
      {
        id: 'austerity',
        label: '极限节流，勒紧腰带',
        hint: '年支出 ×0.6 持续 5 年，先活下来',
        effects: [{ type: 'expenseMult', factor: 0.6, durationYears: 5 }],
      },
      {
        id: 'family',
        label: '向家人开口求助',
        hint: '现在 +¥100,000，欠下一份人情',
        effects: [
          { type: 'cash', amount: 100000 },
          { type: 'setFlag', flag: 'family-debt' },
        ],
      },
      {
        id: 'sell',
        label: '变卖一切，换一口气',
        hint: '现在 +30% 开局资产，年收入 ×0.9 持续 3 年',
        effects: [
          { type: 'cashRelative', basis: 'initialAssets', ratio: 0.3 },
          { type: 'incomeMult', factor: 0.9, durationYears: 3 },
        ],
      },
    ],
  },
];
