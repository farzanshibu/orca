import { translate } from '@/i18n/i18n'
import type { FloorRect } from './office-floor-plan'

/** The pile stops growing here; the button under the desk carries the real count. */
export const RECEPTION_PILE_LIMIT = 4
const SHEET = { w: 11, h: 2 }

/**
 * The notes in the reception tray, bottom sheet first: one per thing waiting on the human, up to
 * the limit. `waiting` is `collectTeamAttention(...).count`, the number the Inbox tab shows.
 */
export function receptionNoteSheets(tray: FloorRect, waiting: number): FloorRect[] {
  const sheets = Math.min(RECEPTION_PILE_LIMIT, Math.max(0, Math.floor(waiting)))
  return Array.from({ length: sheets }, (_, index) => ({
    // Every other sheet sits a unit to the side, so the pile reads as loose paper.
    x: tray.x + 2 + (index % 2),
    y: tray.y + tray.h - 2 - (index + 1) * SHEET.h,
    ...SHEET
  }))
}

export function receptionWaitingLabel(waiting: number): string {
  return translate('team.floor.reception.waiting', '{{count}} waiting on you', { count: waiting })
}
