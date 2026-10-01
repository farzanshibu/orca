import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { z } from 'zod'
import type { OrchestrationDb } from '../orchestration/db'
import { acceptTeamTrigger } from './team-trigger-intake'

export const TEAM_WEBHOOK_DEFAULT_PORT = 47890
const MAX_BODY_BYTES = 64 * 1024

const WebhookBodySchema = z.object({
  text: z.string().min(1).max(16_000),
  target: z.string().min(1).max(64).optional(),
  task: z
    .object({ title: z.string().min(1).max(200), spec: z.string().min(1).max(16_000) })
    .optional()
})

export function teamWebhookPath(teamId: string): string {
  return `/team/${encodeURIComponent(teamId)}/hook`
}

function tokenMatches(expected: string, header: string | undefined): boolean {
  const presented = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : ''
  const a = Buffer.from(expected)
  const b = Buffer.from(presented)
  return a.length === b.length && timingSafeEqual(a, b)
}

type TeamWebhookReply = { error: string } | ReturnType<typeof acceptTeamTrigger>

function reply(res: ServerResponse, status: number, body: TeamWebhookReply): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<string | null> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    size += buffer.length
    if (size > MAX_BODY_BYTES) {
      return null
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Loopback-only intake for outside triggers (CI, Slack via a relay, scripts). It listens only
 * while at least one team has a webhook token; exposing it beyond this machine is the user's
 * explicit choice through their own tunnel.
 */
export class TeamWebhookServer {
  private server: Server | null = null
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly getDb: () => OrchestrationDb,
    private readonly port = TEAM_WEBHOOK_DEFAULT_PORT
  ) {}

  start(intervalMs = 30_000): void {
    if (this.timer) {
      return
    }
    this.sync()
    this.timer = setInterval(() => this.sync(), intervalMs)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.closeServer()
  }

  private closeServer(): void {
    const server = this.server
    this.server = null
    if (!server) {
      return
    }
    server.close()
    // close() alone waits on keep-alive sockets, which would hold the port past a quit.
    server.closeAllConnections()
  }

  private sync(): void {
    const wanted = this.getDb()
      .listTeams()
      .some((team) => team.webhook_token && team.trigger_mode !== 'off')
    if (wanted && !this.server) {
      const server = createServer((req, res) => void this.handle(req, res))
      server.on('error', (error) => {
        console.warn('[team-webhooks] listener failed:', error)
        if (this.server === server) {
          this.server = null
        }
      })
      server.listen(this.port, '127.0.0.1')
      this.server = server
    } else if (!wanted && this.server) {
      this.closeServer()
    }
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const match = /^\/team\/([^/]+)\/hook$/.exec(
      new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    )
    if (req.method !== 'POST' || !match) {
      reply(res, 404, { error: 'not_found' })
      return
    }
    const db = this.getDb()
    const team = db.getTeam(decodeURIComponent(match[1]))
    if (!team?.webhook_token || !tokenMatches(team.webhook_token, req.headers.authorization)) {
      reply(res, 401, { error: 'unauthorized' })
      return
    }
    if (team.trigger_mode === 'off') {
      reply(res, 403, { error: 'triggers_off' })
      return
    }
    const raw = await readBody(req)
    if (raw === null) {
      reply(res, 413, { error: 'too_large' })
      return
    }
    let parsed: z.infer<typeof WebhookBodySchema>
    try {
      parsed = WebhookBodySchema.parse(JSON.parse(raw))
    } catch {
      reply(res, 400, { error: 'invalid_body' })
      return
    }
    try {
      const result = acceptTeamTrigger(db, team, {
        source: 'webhook',
        text: parsed.text,
        target: parsed.target ?? 'manager',
        task: parsed.task
      })
      reply(res, 202, result)
    } catch (error) {
      reply(res, 409, { error: error instanceof Error ? error.message : 'rejected' })
    }
  }
}
