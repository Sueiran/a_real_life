import { replay } from '../src/simulation/engine';
import { summarizeEnding } from '../src/simulation/endings';
import { baseInputs } from '../src/test/fixtures';

const SEED = 'demo-seed-2026';
const inputs = baseInputs(); // 2026 / 30 岁 / 20 万资产 / 20 万收入 / 12 万支出 / auto 目标

const state = replay(inputs, SEED);

const f = (v: number) => v.toFixed(2);
console.log(`seed = ${SEED}`);
console.log('年份 | 年龄 | 年初资产 | 投资收益率 | 年收入 | 年支出 | 年末资产 | 目标金额');
for (const y of state.years.slice(0, 10)) {
  console.log(
    [
      y.calendarYear,
      y.age,
      f(y.assetsStart),
      (y.marketReturn * 100).toFixed(4) + '%',
      f(y.income),
      f(y.expenses),
      f(y.assets),
      f(y.goalAmount),
    ].join(' | '),
  );
}

console.log('\n手算核对（公式：年末 = 年初×(1+r) + 收入 − 支出）');
for (const y of state.years.slice(0, 3)) {
  const manual = y.assetsStart * (1 + y.marketReturn) + y.income - y.expenses;
  console.log(
    `${y.calendarYear}: ${f(y.assetsStart)} × (1 + ${y.marketReturn.toFixed(8)}) + ${f(y.income)} − ${f(y.expenses)} = ${f(manual)}（引擎 ${f(y.assets)}，差 ${(manual - y.assets).toExponential(2)}）`,
  );
}

const ending = summarizeEnding(state);
console.log(`\n结局：${state.status}（${ending?.title}），共 ${state.years.length} 年，结束年龄 ${ending?.age}，日历年 ${ending?.calendarYear}`);
