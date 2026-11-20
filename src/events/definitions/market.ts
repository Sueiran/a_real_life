import type { EventDef } from '../../simulation/types';

export const marketEvents: EventDef[] = [
  {
    id: 'bull-fever',
    category: 'market',
    weight: 6,
    minAge: 18,
    maxAge: 90,
    cooldownYears: 9,
    once: false,
    minAssets: 100000,
    // 只有当年市场真实大涨，才出现全民狂热的故事。
    minMarketReturn: 0.1,
    title: '全民都在谈股票',
    description: '今年市场大涨，邻居和同事们都在晒收益。券商的朋友说，加杠杆才能抓住时代。',
    choices: [
      {
        id: 'leverage',
        label: '加杠杆，搏一把',
        hint: '年收益率 +8% 持续 3 年，但暴跌时现金损失翻倍',
        effects: [
          { type: 'returnDelta', delta: 0.08, durationYears: 3 },
          { type: 'setFlag', flag: 'leveraged', durationYears: 3 },
        ],
      },
      {
        id: 'stay',
        label: '不跟，守住纪律',
        hint: '维持原配置，睡得安稳',
        effects: [],
      },
    ],
  },
  {
    id: 'market-crash',
    category: 'market',
    weight: 6,
    minAge: 18,
    maxAge: 90,
    cooldownYears: 9,
    once: false,
    minAssets: 50000,
    // 只有当年市场真实下跌超过 10%，才出现暴跌故事。
    maxMarketReturn: -0.1,
    title: '市场暴跌，账户一片绿',
    description: '今年市场大幅下跌，你的持仓缩水明显。群里有人割肉，有人抄底，没人知道底在哪。',
    choices: [
      {
        id: 'sell',
        label: '割肉离场，先保命',
        hint: '现在 -15% 当前资产，年收益率 -2% 持续 2 年（加杠杆时现金损失翻倍）',
        effects: [
          { type: 'cashRelative', basis: 'assetsNow', ratio: -0.15 },
          {
            type: 'cashRelative',
            basis: 'assetsNow',
            ratio: -0.15,
            condition: { requiresFlags: ['leveraged'] },
          },
          { type: 'returnDelta', delta: -0.02, durationYears: 2 },
        ],
      },
      {
        id: 'hold',
        label: '躺平装死，不动',
        hint: '不做操作，扛过波动',
        effects: [],
      },
      {
        id: 'buy',
        label: '逆势加仓，赌反弹',
        hint: '现在 -20% 当前资产，年收益率 +3% 持续 5 年（加杠杆时现金损失翻倍）',
        effects: [
          { type: 'cashRelative', basis: 'assetsNow', ratio: -0.2 },
          {
            type: 'cashRelative',
            basis: 'assetsNow',
            ratio: -0.2,
            condition: { requiresFlags: ['leveraged'] },
          },
          { type: 'returnDelta', delta: 0.03, durationYears: 5 },
        ],
      },
    ],
  },
  {
    id: 'rate-cycle',
    category: 'market',
    weight: 5,
    minAge: 30,
    maxAge: 70,
    cooldownYears: 12,
    once: false,
    title: '利率一降再降',
    description: '银行存款利率又下调了，理财经理劝你把一部分钱挪去债基。收益更低，但夜里睡得踏实。',
    choices: [
      {
        id: 'bonds',
        label: '转投债基，求稳',
        hint: '年收益率 -1% 永久，用收益换心安',
        effects: [{ type: 'returnDelta', delta: -0.01, durationYears: 'permanent' }],
      },
      {
        id: 'keep',
        label: '维持原配置',
        hint: '不改变策略，接受波动',
        effects: [],
      },
    ],
  },
];
