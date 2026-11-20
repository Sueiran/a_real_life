import { createInitialState, stepYear } from '../simulation/engine';
import { DEFAULT_CONFIG } from '../simulation/config';
import { EVENT_POOL } from '../events/definitions';
import type { ChoiceLogEntry, EventDef, SimConfig, SimInputs, SimState } from '../simulation/types';

// 游标重建：推进到恰好 nextYearIndex 个已结算年。
// expectPending=true 时还会计算游标当年并保留待决事件（eventPending 存档 / 回到抉择）；
// false 时停在游标边界，不预计算下一年（playing/paused 存档）。
// replay() 会一路跑到下一个缺选择的事件或结局，无法停在任意已观看年份，故此处手动步进。
export function rebuildTo(
  inputs: SimInputs,
  seed: string,
  choices: readonly ChoiceLogEntry[],
  nextYearIndex: number,
  config: SimConfig = DEFAULT_CONFIG,
  eventPool: readonly EventDef[] = EVENT_POOL,
  expectPending = false,
): SimState {
  let state = createInitialState(inputs, seed, config, eventPool);
  while (state.status === 'running') {
    if (state.years.length > nextYearIndex) break;
    if (state.years.length === nextYearIndex && !expectPending) break;
    if (state.pending) {
      if (state.years.length === nextYearIndex) break;
      const { year, event } = state.pending;
      const choice = choices.find((c) => c.yearIndex === year.yearIndex && c.eventId === event.id);
      if (!choice || !event.choices.some((c) => c.id === choice.choiceId)) break;
      state = stepYear(state, choice).state;
    } else {
      state = stepYear(state).state;
    }
  }
  return state;
}