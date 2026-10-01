import { describe, expect, it } from 'vitest'
import { floorThought } from './office-floor-thought'

describe('floor thought', () => {
  it('names the tool and the last part of the path it is aimed at', () => {
    expect(floorThought('Edit', 'src/renderer/src/components/team/office-floor-plan.ts')).toBe(
      'Edit · office-floor-plan.ts'
    )
    expect(floorThought('Read', 'D:\\code\\orca\\package.json')).toBe('Read · package.json')
    expect(floorThought('Glob', 'src/main/')).toBe('Glob · main')
  })

  it('keeps a command on one line and cuts it to fit a cloud', () => {
    expect(floorThought('Bash', 'pnpm   test\n  src/foo.test.ts')).toBe(
      'Bash · pnpm test src/foo.test.ts'
    )
    const long = floorThought('Bash', 'pnpm run check:code-quality:changed --since origin/main')
    expect(long).toBe('Bash · pnpm run check:code-quality:cha…')
    expect(long.length).toBeLessThanOrEqual('Bash · '.length + 32)
  })

  it('says the tool alone when it has no target, and nothing without a tool', () => {
    expect(floorThought(' Task ', undefined)).toBe('Task')
    expect(floorThought('Task', '   ')).toBe('Task')
    expect(floorThought('', 'src/foo.ts')).toBe('')
    expect(floorThought(undefined, undefined)).toBe('')
  })
})
