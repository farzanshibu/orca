export type TeamMemoryKind = 'ticket' | 'agent' | 'note'

export type TeamMemoryDoc = {
  kind: TeamMemoryKind
  id: string
  title: string
  text: string
  /** Ids of other docs this one mentions or belongs to. */
  links: string[]
}

export type TeamMemoryHit = {
  kind: TeamMemoryKind
  id: string
  title: string
  snippet: string
  score: number
}

const STOPWORDS = new Set(
  'a an and are as at be by for from has have in is it its of on or that the this to was were will with we you your our'.split(
    ' '
  )
)

/** Lowercased words with a light suffix strip, so `tests`, `testing`, and `tested` meet. */
export function tokenizeTeamMemory(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
    .map((word) =>
      word.length > 5
        ? word.replace(/(ing|ed|es)$/, '')
        : word.length > 3
          ? word.replace(/s$/, '')
          : word
    )
}

function snippetFor(text: string, terms: ReadonlySet<string>): string {
  const lines = text.split('\n').filter((line) => line.trim())
  const hit = lines.find((line) => tokenizeTeamMemory(line).some((term) => terms.has(term)))
  return (hit ?? lines[0] ?? '').trim().slice(0, 200)
}

/**
 * TF-IDF ranking over the team's tickets, agents, and notes. An empty query lists recent-first
 * docs unranked so the Memory view is never blank.
 */
export function rankTeamMemory(
  docs: readonly TeamMemoryDoc[],
  query: string,
  limit = 20
): TeamMemoryHit[] {
  const terms = new Set(tokenizeTeamMemory(query))
  if (terms.size === 0) {
    return docs.slice(0, limit).map((doc) => ({
      kind: doc.kind,
      id: doc.id,
      title: doc.title,
      snippet: snippetFor(doc.text, terms),
      score: 0
    }))
  }
  const tokenized = docs.map((doc) => tokenizeTeamMemory(`${doc.title} ${doc.title} ${doc.text}`))
  const documentFrequency = new Map<string, number>()
  for (const tokens of tokenized) {
    for (const term of new Set(tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1)
    }
  }
  const hits: TeamMemoryHit[] = []
  docs.forEach((doc, index) => {
    const tokens = tokenized[index]
    let score = 0
    for (const term of terms) {
      const count = tokens.filter((token) => token === term).length
      if (count > 0) {
        const idf = Math.log(1 + docs.length / (documentFrequency.get(term) ?? 1))
        score += (count / Math.sqrt(tokens.length)) * idf
      }
    }
    if (score > 0) {
      hits.push({
        kind: doc.kind,
        id: doc.id,
        title: doc.title,
        snippet: snippetFor(doc.text, terms),
        score
      })
    }
  })
  return hits.sort((a, b) => b.score - a.score).slice(0, limit)
}

export type TeamMemoryGraph = {
  nodes: { id: string; kind: TeamMemoryKind; label: string }[]
  edges: { from: string; to: string }[]
}

export function buildTeamMemoryGraph(docs: readonly TeamMemoryDoc[]): TeamMemoryGraph {
  const ids = new Set(docs.map((doc) => doc.id))
  const seen = new Set<string>()
  const edges: TeamMemoryGraph['edges'] = []
  for (const doc of docs) {
    for (const target of doc.links) {
      const key = [doc.id, target].sort().join('\u0000')
      if (target !== doc.id && ids.has(target) && !seen.has(key)) {
        seen.add(key)
        edges.push({ from: doc.id, to: target })
      }
    }
  }
  return {
    nodes: docs.map((doc) => ({ id: doc.id, kind: doc.kind, label: doc.title })),
    edges
  }
}

/** Doc ids a free-text note mentions: `@member:<slug>`, `@<slug>`, or a task ref like `bmt-12`. */
export function findTeamMemoryMentions(
  text: string,
  memberIdsBySlug: ReadonlyMap<string, string>,
  taskIdsByRef: ReadonlyMap<string, string>
): string[] {
  const found = new Set<string>()
  for (const [, slug] of text.matchAll(/@(?:member:)?([a-z0-9][a-z0-9-]{0,39})/g)) {
    const id = memberIdsBySlug.get(slug)
    if (id) {
      found.add(id)
    }
  }
  for (const [ref] of text.toLowerCase().matchAll(/\b[a-z]{1,6}-\d+\b/g)) {
    const id = taskIdsByRef.get(ref)
    if (id) {
      found.add(id)
    }
  }
  return [...found]
}
