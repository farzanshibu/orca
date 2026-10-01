// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TeamActivityFeed } from './TeamActivityFeed'
import { TeamActivityList } from './team-activity-list'
import { makeTeamActivityEntry } from './team-activity-test-fixtures'
import { buildTeamFeedRows } from './team-feed-threads'
import { teamFloorHighlight } from './team-floor-highlight'
import { makeTeamMember } from './team-snapshot-test-fixtures'
import type { TeamActivity } from './use-team-activity'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const members = [
  makeTeamMember({ id: 'member_1', slug: 'ada', display_name: 'Ada', is_manager: 1 }),
  makeTeamMember({ id: 'member_2', slug: 'grace', display_name: 'Grace' }),
  makeTeamMember({ id: 'member_3', slug: 'linus', display_name: 'Linus' })
]

const entries = [
  makeTeamActivityEntry(1, { subject: 'Kickoff', thread_id: 't1', body_preview: 'Plan attached.' }),
  makeTeamActivityEntry(2, {
    kind: 'dispatch_started',
    task_ref: 'bmt-4',
    subject: 'Build the importer',
    to: { party: 'member', member_ids: ['member_3'] }
  }),
  makeTeamActivityEntry(3, {
    kind: 'budget_alert',
    status: 'over_limit',
    subject: 'Spend is past the cap',
    from: { party: 'auditor', member_id: null },
    to: { party: 'team', member_ids: [] }
  }),
  makeTeamActivityEntry(4, {
    subject: 'Re: Kickoff',
    thread_id: 't1',
    from: { party: 'member', member_id: 'member_2' },
    to: { party: 'member', member_ids: ['member_1'] }
  })
]

function activityOf(overrides: Partial<TeamActivity> = {}): TeamActivity {
  return {
    entries,
    live: [],
    epoch: 1,
    source: 'activity',
    loaded: true,
    error: null,
    ...overrides
  }
}

let container: HTMLDivElement
let root: Root

async function render(node: React.ReactNode): Promise<void> {
  await act(async () => {
    root.render(node)
  })
}

async function click(element: Element | undefined): Promise<void> {
  expect(element).toBeDefined()
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

const badges = (): string[] =>
  Array.from(container.querySelectorAll('[data-slot="badge"]'), (badge) => badge.textContent ?? '')

const buttonWith = (text: string): Element | undefined =>
  Array.from(container.querySelectorAll('button')).find((button) =>
    button.textContent?.includes(text)
  )

const buttonLabelled = (label: string): Element | undefined =>
  container.querySelector(`button[aria-label="${label}"]`) ?? undefined

describe('TeamActivityFeed', () => {
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    teamFloorHighlight.clear()
  })

  it('lists every event oldest first, naming who it was between and what kind it is', async () => {
    await render(<TeamActivityFeed activity={activityOf()} members={members} />)

    expect(badges()).toEqual(['Status', 'Work started', 'Budget alert', 'Status'])
    expect(container.textContent).toContain('Kickoff')
    expect(container.textContent).toContain('bmt-4 · Build the importer')
    expect(buttonWith('Build the importer')?.textContent).toContain('Ada')
    expect(buttonWith('Build the importer')?.textContent).toContain('Linus')
  })

  it('shows a kind and a party it does not know as a plain readable row', async () => {
    await render(<TeamActivityFeed activity={activityOf()} members={members} />)

    const row = buttonWith('Spend is past the cap')
    expect(row?.textContent).toContain('Budget alert')
    expect(row?.textContent).toContain('Over limit · Spend is past the cap')
    expect(row?.textContent).toContain('Auditor')
    expect(row?.textContent).toContain('Team')
  })

  it('marks the people of a clicked row on the floor, and the row with them', async () => {
    await render(<TeamActivityFeed activity={activityOf()} members={members} />)

    await click(buttonWith('Build the importer'))

    expect([...teamFloorHighlight.highlightedMemberIds()]).toEqual(['member_1', 'member_3'])
    const current = container.querySelectorAll('[data-current="true"]')
    expect(current).toHaveLength(1)
    expect(current[0].textContent).toContain('Build the importer')

    await act(async () => {
      teamFloorHighlight.clear()
    })
    expect(container.querySelectorAll('[data-current="true"]')).toHaveLength(0)
  })

  it('keeps a body behind its toggle', async () => {
    await render(<TeamActivityFeed activity={activityOf()} members={members} />)
    expect(container.textContent).not.toContain('Plan attached.')

    await click(buttonLabelled('Show the message'))
    expect(container.textContent).toContain('Plan attached.')
  })

  it('filters by kind of activity', async () => {
    await render(<TeamActivityFeed activity={activityOf()} members={members} />)

    await click(buttonWith('Work'))
    expect(badges()).toEqual(['Work started'])

    await click(buttonWith('People'))
    expect(badges()).toEqual([])
    expect(container.textContent).toContain('Nothing matches these filters.')
  })

  it('narrows to one thread and back', async () => {
    await render(<TeamActivityFeed activity={activityOf()} members={members} />)

    await click(buttonLabelled('Show the 2 messages of this thread'))
    expect(container.textContent).toContain('Showing one thread')
    expect(badges()).toEqual(['Status', 'Status'])

    await click(buttonWith('Show everything'))
    expect(badges()).toHaveLength(4)
  })

  it('says nothing about an empty feed until the first page is in', async () => {
    await render(
      <TeamActivityFeed activity={activityOf({ entries: [], loaded: false })} members={members} />
    )
    expect(container.textContent).not.toContain('Nothing has happened')

    await render(<TeamActivityFeed activity={activityOf({ entries: [] })} members={members} />)
    expect(container.textContent).toContain('Nothing has happened on this team yet.')
  })

  it('says so when the host only has its message log, and when polls are failing', async () => {
    await render(<TeamActivityFeed activity={activityOf({ source: 'legacy' })} members={members} />)
    expect(container.textContent).toContain('Messages only on this host')

    await render(
      <TeamActivityFeed activity={activityOf({ error: 'runtime_timeout' })} members={members} />
    )
    expect(container.textContent).toContain('Reconnecting…')
    // What it already had stays on screen.
    expect(badges()).toHaveLength(4)
  })
})

describe('TeamActivityList', () => {
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('is read-only where it does not point at the floor, with bodies open when asked', async () => {
    await render(
      <TeamActivityList
        rows={buildTeamFeedRows(entries)}
        members={members}
        emptyLabel={null}
        bodiesOpen
      />
    )

    expect(buttonWith('Build the importer')).toBeUndefined()
    expect(container.textContent).toContain('Build the importer')
    expect(container.textContent).toContain('Plan attached.')
    // No thread control without somewhere to open the thread.
    expect(buttonLabelled('Show the 2 messages of this thread')).toBeUndefined()
  })

  it('shows the whole message where it is given one, and the preview where it is not', async () => {
    await render(
      <TeamActivityList
        rows={buildTeamFeedRows(entries)}
        members={members}
        emptyLabel={null}
        fullBodies={new Map([['msg_1', 'Plan attached. Then everything the preview cut off.']])}
        bodiesOpen
      />
    )
    expect(container.textContent).toContain('Then everything the preview cut off.')

    await render(
      <TeamActivityList
        rows={buildTeamFeedRows(entries)}
        members={members}
        emptyLabel={null}
        fullBodies={new Map()}
        bodiesOpen
      />
    )
    expect(container.textContent).toContain('Plan attached.')
    expect(container.textContent).not.toContain('Then everything')
  })
})
