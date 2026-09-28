import { describe, expect, it } from 'vitest'
import { mergeMcpServers } from './team-member-workspace'

describe('mergeMcpServers', () => {
  it('adds granted servers without dropping the repo’s own', () => {
    const existing = JSON.stringify({ mcpServers: { repo: { command: 'repo-mcp' } }, other: 1 })
    const merged = JSON.parse(
      mergeMcpServers(existing, [
        { name: 'docs', command: 'npx', args: ['docs'] },
        { name: 'web', url: 'https://example.com/mcp' }
      ])
    )
    expect(merged).toEqual({
      other: 1,
      mcpServers: {
        repo: { command: 'repo-mcp' },
        docs: { command: 'npx', args: ['docs'] },
        web: { type: 'http', url: 'https://example.com/mcp' }
      }
    })
  })

  it('replaces an unreadable file', () => {
    expect(JSON.parse(mergeMcpServers('{nope', [{ name: 'a', command: 'a' }]))).toEqual({
      mcpServers: { a: { command: 'a' } }
    })
  })
})
