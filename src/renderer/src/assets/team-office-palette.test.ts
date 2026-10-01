import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  OFFICE_ENVIRONMENT_PAINTS,
  OFFICE_PAINTS,
  OFFICE_PEOPLE_PAINTS
} from '../components/team/office-floor-palette'

const mainCss = fs
  .readFileSync(new URL('./main.css', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

function getCssRuleBody(selector: string): string {
  const ruleMarker = mainCss.indexOf(`\n${selector} {`)
  expect(ruleMarker).toBeGreaterThanOrEqual(0)

  const bodyStart = mainCss.indexOf('{', ruleMarker + 1) + 1
  return mainCss.slice(bodyStart, mainCss.indexOf('}', bodyStart))
}

/** Custom properties with `prefix` declared in a rule, name → value. */
function declarations(selector: string, prefix: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const [, name, value] of getCssRuleBody(selector).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (name.startsWith(prefix)) {
      found.set(name, value)
    }
  }
  return found
}

function referenced(value: string): string[] {
  return [...value.matchAll(/var\((--[\w-]+)/g)].map(([, name]) => name)
}

const light = declarations(':root', '--office-')
const dark = declarations('.dark', '--office-')
const paints = declarations('.team-office', '--tof-')

/** Every non-`--tof-*` variable a paint ends up reading, following `--tof-*` references through. */
function resolvedSources(paint: string, seen: readonly string[] = []): string[] {
  expect(seen).not.toContain(paint)
  const value = paints.get(paint)
  expect(value, `${paint} is not declared on .team-office`).toBeDefined()
  return referenced(value ?? '').flatMap((name) =>
    name.startsWith('--tof-') ? resolvedSources(name, [...seen, paint]) : [name]
  )
}

describe('team office palette', () => {
  it('defines every --office-* token in both themes', () => {
    expect(light.size).toBeGreaterThan(0)
    expect([...dark.keys()].sort()).toEqual([...light.keys()].sort())
  })

  it('declares exactly the paints the typed palette names', () => {
    expect([...paints.keys()].sort()).toEqual(OFFICE_PAINTS.map((paint) => `--tof-${paint}`).sort())
  })

  it('resolves every room and furniture paint through --office-* tokens only', () => {
    for (const paint of OFFICE_ENVIRONMENT_PAINTS) {
      const sources = resolvedSources(`--tof-${paint}`)
      expect(sources.length, paint).toBeGreaterThan(0)
      for (const source of sources) {
        expect(light.has(source), `${paint} reads ${source}`).toBe(true)
      }
    }
  })

  it('uses every --office-* token', () => {
    const used = new Set(
      OFFICE_ENVIRONMENT_PAINTS.flatMap((paint) => resolvedSources(`--tof-${paint}`))
    )
    expect([...light.keys()].filter((token) => !used.has(token))).toEqual([])
  })

  it('keeps the paints that identify a person the same in both themes', () => {
    for (const paint of OFFICE_PEOPLE_PAINTS) {
      const sources = resolvedSources(`--tof-${paint}`)
      expect(sources.length, paint).toBeGreaterThan(0)
      for (const source of sources) {
        // Tailwind's palette is fixed; --office-* and app tokens such as --background are not.
        expect(source, paint).toMatch(/^--color-[a-z]+-\d+$/)
      }
    }
  })
})
