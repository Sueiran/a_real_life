import type { EventDef } from '../../simulation/types';
import { careerEvents } from './career';
import { familyEvents } from './family';
import { marketEvents } from './market';
import { lifestyleEvents } from './lifestyle';
import { shockEvents } from './shock';
import { rescueEvents } from './rescue';

export const EVENT_POOL: EventDef[] = [
  ...careerEvents,
  ...familyEvents,
  ...marketEvents,
  ...lifestyleEvents,
  ...shockEvents,
  ...rescueEvents,
];

export function eventById(id: string): EventDef | undefined {
  return EVENT_POOL.find((e) => e.id === id);
}
