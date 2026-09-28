const TEAM_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/

/** Team member and role slugs double as mail addresses (`@member:<slug>`), so keep them path- and shell-safe. */
export function isValidTeamSlug(value: string): boolean {
  return TEAM_SLUG_PATTERN.test(value)
}

/** Lowercases and dashes free text into a slug, or null when nothing usable remains. */
export function toTeamSlug(value: string): string | null {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
  return isValidTeamSlug(slug) ? slug : null
}
