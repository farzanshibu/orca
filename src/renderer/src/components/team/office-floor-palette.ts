/**
 * Paint names for the office pixel art. Each one is a `--tof-*` variable on `.team-office` in
 * main.css; `team-office-palette.test.ts` keeps this list and that rule identical.
 */

/** Rooms and furniture. Mixed from the `--office-*` tokens, so they change with the theme. */
export const OFFICE_ENVIRONMENT_PAINTS = [
  'ink',
  'shadow',
  'floor',
  'floor-line',
  'floor-meeting',
  'floor-meeting-line',
  'boards',
  'boards-line',
  'lobby',
  'lobby-line',
  'tile',
  'tile-alt',
  'concrete',
  'concrete-line',
  'marking',
  'wall-top',
  'wall-face',
  'wall-trim',
  'sky',
  'sky-glint',
  'glass',
  'glass-pane',
  'wood',
  'wood-light',
  'wood-dark',
  'paper',
  'paper-line',
  'whiteboard',
  'sign',
  'cardboard',
  'cardboard-dark',
  'mug',
  'metal',
  'metal-dark',
  'counter',
  'cabinet',
  'fridge',
  'chair',
  'chair-light',
  'chair-dark',
  'fabric',
  'fabric-dark',
  'rug',
  'rug-inner',
  'table-green',
  'plant',
  'plant-dark',
  'pot',
  'marker-blue',
  'marker-red',
  'marker-green',
  'screen-off',
  'screen-work',
  'screen-line',
  'screen-wait',
  'screen-idle'
] as const

export const OFFICE_SKIN_PAINTS = ['skin-0', 'skin-1', 'skin-2'] as const
export const OFFICE_HAIR_PAINTS = ['hair-0', 'hair-1', 'hair-2', 'hair-3', 'hair-4'] as const
/** Staff shirts; the manager's suit is not in the rotation. */
export const OFFICE_SHIRT_PAINTS = [
  'shirt-0',
  'shirt-1',
  'shirt-2',
  'shirt-3',
  'shirt-4',
  'shirt-5'
] as const

// Why: these identify a person, so they are the same in both themes; a member recoloured by the
// theme would read as someone else.
export const OFFICE_PEOPLE_PAINTS = [
  ...OFFICE_SKIN_PAINTS,
  ...OFFICE_HAIR_PAINTS,
  ...OFFICE_SHIRT_PAINTS,
  'shirt-0-shade',
  'shirt-1-shade',
  'shirt-2-shade',
  'shirt-3-shade',
  'shirt-4-shade',
  'shirt-5-shade',
  'shirt-suit',
  'shirt-suit-shade',
  'blush',
  'mouth',
  'tie',
  'pants'
] as const

export const OFFICE_PAINTS = [...OFFICE_ENVIRONMENT_PAINTS, ...OFFICE_PEOPLE_PAINTS] as const

export type Paint = (typeof OFFICE_PAINTS)[number]
export type SkinPaint = (typeof OFFICE_SKIN_PAINTS)[number]
export type HairPaint = (typeof OFFICE_HAIR_PAINTS)[number]
export type ShirtPaint = (typeof OFFICE_SHIRT_PAINTS)[number] | 'shirt-suit'

/** The CSS value that fills an art pixel with `paint`. */
export function paintFill(paint: Paint): string {
  return `var(--tof-${paint})`
}

/** The darker tone that shades a shirt's collar and back seam. */
export function shirtShade(shirt: ShirtPaint): Paint {
  return `${shirt}-shade`
}
