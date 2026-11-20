import type { SimState, YearState } from '../../simulation/types';
import type { EndingSummary } from '../../simulation/endings';
import { eventById } from '../../events/definitions';
import { formatMoney } from '../../lib/format';

export interface NarrativeEvent {
  yearIndex: number;
  eventId: string;
  choiceId: string;
  calendarYear: number;
  title: string;
  choiceLabel: string;
  cashImpact: number;
}

export interface LifeNarrative {
  opening: string;
  turning: NarrativeEvent | null;
  turningText: string | null;
  story: string[];
  closing: string;
  referencedEvents: NarrativeEvent[];
}

function toNarrativeEvent(y: YearState): NarrativeEvent | null {
  if (!y.eventId || !y.choiceId) return null;
  const def = eventById(y.eventId);
  const choice = def?.choices.find((c) => c.id === y.choiceId);
  if (!def || !choice) return null;
  return {
    yearIndex: y.yearIndex,
    eventId: y.eventId,
    choiceId: y.choiceId,
    calendarYear: y.calendarYear,
    title: def.title,
    choiceLabel: choice.label,
    cashImpact: (y.eventCash ?? 0) + (y.scheduledCashApplied ?? 0),
  };
}

function sentence(e: NarrativeEvent): string {
  return `${e.calendarYear} 年，${e.title}，你选择了「${e.choiceLabel}」。`;
}

export function buildNarrative(sim: SimState, ending: EndingSummary): LifeNarrative {
  const events = sim.years
    .map(toNarrativeEvent)
    .filter((e): e is NarrativeEvent => e !== null);

  let turning: NarrativeEvent | null = null;
  for (const e of events) {
    if (!turning || Math.abs(e.cashImpact) > Math.abs(turning.cashImpact)) turning = e;
  }

  const turningText = turning
    ? `${turning.calendarYear} 年，${turning.title}——你选择了「${turning.choiceLabel}」。` +
      (turning.cashImpact !== 0
        ? `那一年，你的财富${turning.cashImpact > 0 ? '增加' : '减少'}了 ${formatMoney(Math.abs(turning.cashImpact))}。`
        : '')
    : null;

  // 故事只取真实发生的节点：转折点之外，取首尾与中点，最多三句。
  const rest = events.filter((e) => e !== turning);
  const picks: NarrativeEvent[] = [];
  if (rest.length > 0) picks.push(rest[0]);
  if (rest.length > 2) picks.push(rest[Math.floor(rest.length / 2)]);
  if (rest.length > 1) picks.push(rest[rest.length - 1]);
  const story = picks.map(sentence);

  const { status, ratio } = ending;
  let opening: string;
  let closing: string;
  if (status === 'fire') {
    if (sim.years.length === 0) {
      opening = '等等——你开局就已经站在终点线上了。';
      closing = '原来这场游戏，你一开始就赢了。';
    } else {
      opening = `从 ${sim.inputs.startYear} 年出发，你在 ${ending.age} 岁这一年抵达了自由。`;
      closing = '往后的每一年，都是你自己的。';
    }
  } else if (status === 'bankrupt') {
    opening = '账户清零的那一刻，人生并没有清零。';
    closing = '破产是这一局的终点，不是你的。';
  } else {
    opening = `${sim.years.length} 年过去，你走到了这段人生的终点。`;
    closing =
      ratio !== null && ratio >= 0.8
        ? '差的那一步，留给下一段人生。'
        : ratio !== null && ratio >= 0.5
          ? '没有奇迹，但每一步都算数。'
          : ratio !== null && ratio >= 0.25
            ? '平凡不是失败，是大多数人的真实。'
            : '生活给了你重拳，但你走完了全程。';
  }

  return {
    opening,
    turning,
    turningText,
    story,
    closing,
    referencedEvents: [turning, ...picks].filter((e): e is NarrativeEvent => e !== null),
  };
}