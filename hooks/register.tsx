// site-crew: every subagent and side session this session starts, nested as they
// start each other, drawn as a construction crew. Built on what the engine and the
// app report by themselves, so it works with plain Claude Code:
//
// - subagents, nested ones included: `$.agent.list()` (parent, model, effort, live
//   tokens, cost) plus `agent.spawn`, `turn.complete` and each agent's tool calls;
// - side sessions, at any depth: the app's linked-session list (`startedBy`);
// - what only a side session knows (it waits for the person, its cost, its own
//   subagents): a small status file each started session writes for its parent.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Panel, Worker, WorkerStatus } from '../types'
import { CREW_CSS, CRAB_BOX, ROLE_INFO, crab } from './crew-art.mjs'
import type { Role } from './crew-art.mjs'

const crewAtom = atom({ plugin: 'site-crew', key: 'crew' } as const, [])
const panelAtom = atom({ plugin: 'site-crew', key: 'panel' } as const, {
  isOpen: false,
  isCompact: false,
  isDoneCollapsed: false,
  hasAutoOpened: false,
})
const nowAtom = atom({ plugin: 'site-crew', key: 'now' } as const, 0)

const PANE = 'site-crew'
const MAX_WORKERS = 300
const MAX_TITLE = 120
/** Rows drawn as pictures; the rest are one line of text, so a long session's pane stays small. */
const HERO_ROWS = 10
/** A subagent missing from the engine's list this long has ended (nested ones are dropped within seconds). */
const GONE_MS = 4000
const HAND = '#E0A030'
const DONE = '#3B9C5F'
const FAIL = '#D0453F'
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"

// ---------------------------------------------------------------------------
// Small helpers

const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s)
const xml = (s: string): string => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

// Approximate glyph widths (em) for fitting text into a drawing.
const charEm = (ch: string): number => (/[il.,:;'|!]/.test(ch) ? 0.28 : /[mwMW@]/.test(ch) ? 0.85 : /[A-Z0-9$≈]/.test(ch) ? 0.62 : 0.52)
const textWidth = (s: string, size: number): number => [...s].reduce((w, ch) => w + charEm(ch) * size, 0)
const fitText = (s: string, size: number, maxW: number): string => {
  if (textWidth(s, size) <= maxW) return s
  let out = ''
  for (const ch of s) {
    if (textWidth(out + ch + '…', size) > maxW) break
    out += ch
  }
  return out + '…'
}

const fmtTokens = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n))
const fmtCost = (usd: number): string => `$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`
const fmtTime = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** `claude-opus-5-5` → `Opus 5.5`. */
const modelName = (id = ''): string => {
  const m = /(?:claude-)?([a-z]+)-(\d+)(?:-(\d+))?/i.exec(id)
  const word = m?.[1]
  if (!m || !word) return id || 'model'
  const name = word.charAt(0).toUpperCase() + word.slice(1)
  return m[3] && m[3].length <= 2 ? `${name} ${m[2]}.${m[3]}` : `${name} ${m[2]}`
}

// ---------------------------------------------------------------------------
// Roles: one ladder by capability. The model sets the band (Haiku, Sonnet, Opus, Fable)
// and effort climbs within it: Apprentice < Laborer < Bricklayer < Carpenter < Foreman
// < Engineer < Architect. Opus at low effort and Sonnet at high effort share a rung:
// Opus has the higher ceiling, Sonnet at high effort checks itself more.
// Four roles go by job instead of rank: Surveyor (Explore), Planner (Plan),
// Inspector (testers and reviewers) and Subcontractor (any other model).

const effortOf = (v: unknown): string | undefined =>
  typeof v === 'string' ? v.toLowerCase() : typeof v === 'number' ? (v <= 33 ? 'low' : v <= 66 ? 'medium' : 'high') : undefined

// A whole word in the agent type (`savvy-flow:savvy-tester`, `code-reviewer`), not "latest".
const INSPECTS = /(?:^|[-_:\s])(?:tests?|tester|testing|reviews?|reviewer|verif\w*|audit\w*)(?:$|[-_:\s])/i

const roleOf = (w: Pick<Worker, 'type' | 'model' | 'effort'>): Role => {
  if (w.type === 'Explore') return 'surveyor'
  if (w.type === 'Plan') return 'planner'
  if (INSPECTS.test(w.type)) return 'inspector'
  const m = (w.model ?? '').toLowerCase()
  const e = (w.effort ?? '').toLowerCase()
  const isHigh = e === 'high' || e === 'xhigh' || e === 'max'
  if (/fable|mythos/.test(m)) return 'architect'
  if (/haiku/.test(m)) return 'apprentice'
  if (/sonnet/.test(m)) return isHigh ? 'bricklayer' : 'laborer'
  if (/opus/.test(m)) {
    if (e === 'low') return 'bricklayer'
    if (e === 'high') return 'foreman'
    if (e === 'xhigh' || e === 'max') return 'engineer'
    return 'carpenter'
  }
  return 'sub'
}

const roleName = (r: Role): string => ROLE_INFO[r]?.name ?? r
const roleColor = (r: Role): string => ROLE_INFO[r]?.color ?? '#7D7D79'

// ---------------------------------------------------------------------------
// Crew bookkeeping

const isLive = (w: Worker): boolean => w.status === 'running' || w.status === 'waiting'

async function upsert($: EngineInterface, changes: Worker[]): Promise<void> {
  if (!changes.length) return
  await update($, crewAtom, list => {
    const byId = new Map(list.map(w => [w.id, w]))
    for (const c of changes) byId.set(c.id, { ...(byId.get(c.id) ?? {}), ...c })
    return [...byId.values()].slice(-MAX_WORKERS)
  })
}

// What each agent last did with a tool, kept outside the state: the poll copies it
// in, so a burst of tool calls costs no redraw each.
const activities = new Map<string, string>()

// The harness's own bookkeeping says nothing about the work: the last real tool call stays.
const QUIET_TOOLS = /^(SubagentHandback|ToolSearch|TodoWrite|TaskUpdate|TaskCreate|TaskList|TaskGet|mcp__savvy-progress__.*|mcp__ccd_turn__.*)$/

const activityOf = (tool: string, input: Record<string, unknown>): string => {
  const what = [input.command, input.file_path, input.path, input.pattern, input.url, input.query, input.description, input.prompt]
    .map(str)
    .find(Boolean)
  const name = tool.replace(/^mcp__([^_]+(?:_[^_]+)*)__/, '')
  return clip(`${name}${what ? ': ' + what.replace(/\s+/g, ' ') : ''}`, 90)
}

// When each running agent was last seen in the engine's list.
const lastSeen = new Map<string, number>()

type AgentRow = Awaited<ReturnType<EngineInterface['agent']['list']>>[number]

const statusOfAgent = (a: AgentRow): WorkerStatus =>
  a.status === 'completed' ? 'done' : a.status === 'failed' || a.status === 'killed' ? 'failed' : a.status === 'waiting' || a.status === 'idle' ? 'waiting' : 'running'

async function syncAgents($: EngineInterface, at: number): Promise<boolean> {
  const list = await $.agent.list().catch(() => [] as AgentRow[])
  const crew = await read($, crewAtom)
  const known = new Map(crew.map(w => [w.id, w]))
  const changes: Worker[] = []
  for (const a of list) {
    lastSeen.set(a.id, at)
    const prev = known.get(a.id)
    const status = statusOfAgent(a)
    const summary = a.label && a.label !== a.description ? clip(a.label.split('\n')[0] ?? '', 90) : undefined
    changes.push({
      id: a.id,
      kind: 'agent',
      parent: a.parentId ?? prev?.parent ?? '',
      title: clip(a.description || a.type, MAX_TITLE),
      type: a.type,
      model: a.model ?? a.lastRequest?.model ?? prev?.model,
      effort: effortOf(a.effort ?? a.lastRequest?.effort) ?? prev?.effort,
      status: prev?.status === 'failed' ? 'failed' : status,
      startedAt: a.startTime || prev?.startedAt || at,
      endedAt: status === 'done' || status === 'failed' ? (prev?.endedAt ?? at) : undefined,
      tokens: a.tokenCount,
      contextWindow: a.contextWindowSize,
      samples: a.tokenSamples.slice(-16),
      costUsd: a.cost?.usd ?? prev?.costUsd,
      activity: summary ?? activities.get(a.id) ?? prev?.activity,
    })
  }
  // An agent the engine no longer lists has ended.
  const listed = new Set(list.map(a => a.id))
  for (const w of crew) {
    if (w.kind !== 'agent' || w.id.includes('/') || !isLive(w) || listed.has(w.id)) continue
    if (at - (lastSeen.get(w.id) ?? w.startedAt) < GONE_MS) continue
    changes.push({ ...w, status: 'done', endedAt: w.endedAt ?? at })
  }
  await upsert($, changes)
  return list.some(a => a.status === 'running' || a.status === 'waiting' || a.status === 'pending')
}

// ---------------------------------------------------------------------------
// Side sessions (desktop app)

let hostId = ''
let statusDir = ''
/** This session was started by another one, which reads our status file. */
let parentId = ''

type SessionRow = {
  sessionId: string
  title?: string
  name?: string
  isRunning?: boolean
  isArchived?: boolean
  startedBy?: string
  branch?: string
  prNumber?: number
  prState?: string
  link?: string
  lastActivityAt?: string
}

const sessionInfo = new Map<string, { model?: string; effort?: string; createdAt?: number }>()

async function mcpJson($: EngineInterface, server: string, tool: string, args: Record<string, unknown>): Promise<unknown> {
  const r = await $.mcp.call(server, tool, args)
  if (r.isError) return undefined
  const text = r.content.map(b => (b as { text?: string }).text ?? '').join('')
  try {
    return JSON.parse(text)
  } catch {
    return undefined // "No other sessions found." and other plain answers
  }
}

async function syncSessions($: EngineInterface, at: number): Promise<boolean> {
  if (!hostId) return false
  const rows = (await mcpJson($, 'ccd_session_mgmt', 'list_sessions', { linked: true }).catch(() => undefined)) as SessionRow[] | undefined
  if (!Array.isArray(rows)) return false
  const byId = new Map(rows.map(r => [r.sessionId, r]))
  // Ours: started by this session, or by one of ours, at any depth.
  const isOurs = (r: SessionRow): boolean => {
    let p = r.startedBy
    for (let i = 0; p && i < 12; i++) {
      if (p === hostId) return true
      p = byId.get(p)?.startedBy
    }
    return false
  }
  const crew = await read($, crewAtom)
  const known = new Map(crew.map(w => [w.id, w]))
  const changes: Worker[] = []
  for (const r of rows.filter(isOurs)) {
    if (!sessionInfo.has(r.sessionId)) {
      const s = (await mcpJson($, 'ccd_session_mgmt', 'get_session', { session_id: r.sessionId }).catch(() => undefined)) as
        | { model?: string; effort?: string; createdAt?: string }
        | undefined
      sessionInfo.set(r.sessionId, { model: s?.model, effort: s?.effort, createdAt: s?.createdAt ? Date.parse(s.createdAt) : undefined })
    }
    const info = sessionInfo.get(r.sessionId) ?? {}
    const prev = known.get(r.sessionId)
    const status: WorkerStatus = r.isRunning ? 'running' : 'done'
    changes.push({
      id: r.sessionId,
      kind: 'session',
      parent: r.startedBy === hostId ? '' : (r.startedBy ?? ''),
      title: clip(r.title || r.name || 'session', MAX_TITLE),
      type: 'session',
      model: prev?.model ?? info.model,
      effort: prev?.effort ?? effortOf(info.effort),
      status,
      isWaitingForYou: prev?.isWaitingForYou,
      waitReason: prev?.waitReason,
      startedAt: prev?.startedAt ?? info.createdAt ?? at,
      endedAt: status === 'done' ? (prev?.endedAt ?? at) : undefined,
      tokens: prev?.tokens ?? 0,
      contextWindow: prev?.contextWindow,
      costUsd: prev?.costUsd,
      activity: prev?.activity,
      branch: r.branch,
      pr: r.prNumber ? `#${r.prNumber}${r.prState ? ' ' + r.prState.toLowerCase() : ''}` : undefined,
      link: r.link,
    })
  }
  await upsert($, changes)
  return changes.some(w => w.status === 'running')
}

// ---------------------------------------------------------------------------
// The status file: a started session tells its parent what the app does not.

type SessionState = 'running' | 'waiting' | 'idle'
type StatusFile = {
  hostId: string
  parentId: string
  state: SessionState
  reason?: string
  costUsd?: number
  tokens?: number
  contextWindow?: number
  model?: string
  effort?: string
  activity?: string
  agents: Worker[]
  updatedAt: number
}

let mine: { state: SessionState; reason?: string; activity?: string } = { state: 'idle' }
let writtenBody = ''
let writtenAt = 0
const HEARTBEAT_MS = 60_000

async function publish($: EngineInterface, state?: SessionState, reason?: string): Promise<void> {
  if (!hostId || !parentId || !statusDir) return
  if (state) mine = { ...mine, state, reason: state === 'waiting' ? reason : undefined }
  try {
    const usage = await $.session.usage().catch(() => undefined)
    const agents = (await read($, crewAtom)).filter(w => w.kind === 'agent' && !w.id.includes('/')).slice(-30)
    const body: Omit<StatusFile, 'updatedAt'> = {
      hostId,
      parentId,
      state: mine.state,
      reason: mine.reason,
      costUsd: usage?.cost?.usd,
      tokens: usage?.context?.tokens,
      contextWindow: usage?.context?.window,
      model: await $.session.model().catch(() => undefined),
      activity: mine.activity,
      agents: agents.map(a => ({ ...a, samples: undefined })),
    }
    const text = JSON.stringify(body)
    const at = await $.clock.now()
    if (text === writtenBody && at - writtenAt < HEARTBEAT_MS) return
    await $.fs.write(`${statusDir}/${hostId}.json`, JSON.stringify({ ...body, updatedAt: at }))
    writtenBody = text
    writtenAt = at
  } catch {
    // A locked or unwritable file is tried again with the next change.
  }
}

const statusSeen = new Map<string, number>()
const waitNotified = new Set<string>()

async function readStatusFiles($: EngineInterface): Promise<void> {
  if (!statusDir) return
  const crew = await read($, crewAtom)
  const sessions = crew.filter(w => w.kind === 'session')
  const changes: Worker[] = []
  for (const s of sessions) {
    const path = `${statusDir}/${s.id}.json`
    const st = await $.fs.stat(path).catch(() => null)
    if (!st || statusSeen.get(s.id) === st.mtimeMs) continue
    let f: StatusFile
    try {
      f = JSON.parse(String(await $.fs.read(path))) as StatusFile
    } catch {
      continue // mid-write: the next tick reads it again
    }
    statusSeen.set(s.id, st.mtimeMs)
    const isWaiting = f.state === 'waiting'
    changes.push({
      ...s,
      isWaitingForYou: isWaiting,
      waitReason: isWaiting ? f.reason : undefined,
      costUsd: typeof f.costUsd === 'number' ? f.costUsd : s.costUsd,
      tokens: typeof f.tokens === 'number' ? f.tokens : s.tokens,
      contextWindow: f.contextWindow ?? s.contextWindow,
      model: s.model ?? f.model,
      activity: f.activity ?? s.activity,
    })
    if (isWaiting && !waitNotified.has(s.id)) {
      waitNotified.add(s.id)
      void $.ui.notify(`${s.title}: needs you${f.reason ? ' · ' + f.reason : ''}`, { key: `site-crew-wait-${s.id}` }).catch(() => undefined)
    }
    if (!isWaiting) waitNotified.delete(s.id)
    // The session's own subagents, nested under it.
    for (const a of f.agents ?? []) {
      changes.push({
        ...a,
        id: `${s.id}/${a.id}`,
        parent: a.parent ? `${s.id}/${a.parent}` : s.id,
        link: s.link,
      })
    }
  }
  await upsert($, changes)
}

// ---------------------------------------------------------------------------
// The pane

async function openPane($: EngineInterface): Promise<void> {
  const at = await $.clock.now()
  await update($, nowAtom, () => at)
  await update($, panelAtom, p => ({ ...p, isOpen: true }))
  await $.ui.open({ id: PANE, title: 'Site crew' }).catch(() => undefined)
}

async function togglePane($: EngineInterface): Promise<boolean> {
  const isOpen = (await $.ui.panes().catch(() => [])).some(p => p.id === PANE)
  if (isOpen) {
    await update($, panelAtom, p => ({ ...p, isOpen: false }))
    await $.ui.close({ id: PANE }).catch(() => undefined)
    return false
  }
  await openPane($)
  return true
}

let autoOpen = true

async function maybeAutoOpen($: EngineInterface): Promise<void> {
  if (!autoOpen) return
  const p = await read($, panelAtom)
  if (p.hasAutoOpened) return
  await update($, panelAtom, prev => ({ ...prev, hasAutoOpened: true }))
  await openPane($)
}

async function openSession($: EngineInterface, id: string): Promise<void> {
  for (const target of ['focus', 'split']) {
    try {
      const r = await $.mcp.call('ccd_window', 'open_session_in', { session_id: id, target })
      if (!r.isError) return
    } catch {
      // no window tool on this surface: the toast below says where to look
    }
  }
  $.ui.toast('Open it from the sidebar: the app did not switch to it.')
}

// The tree, parents before children; `depth` 0 is a worker this session started.
type Placed = { w: Worker; depth: number; isLast: boolean }

function layTree(crew: Worker[]): { working: Placed[]; done: Placed[] } {
  const ids = new Set(crew.map(w => w.id))
  const kids = new Map<string, Worker[]>()
  for (const w of crew) {
    const p = w.parent && ids.has(w.parent) ? w.parent : ''
    kids.set(p, [...(kids.get(p) ?? []), w])
  }
  for (const list of kids.values()) list.sort((a, b) => a.startedAt - b.startedAt)
  const subtreeLive = (w: Worker): boolean => isLive(w) || !!w.isWaitingForYou || (kids.get(w.id) ?? []).some(subtreeLive)
  const walk = (w: Worker, depth: number, isLast: boolean, out: Placed[]): void => {
    out.push({ w, depth, isLast })
    const ch = kids.get(w.id) ?? []
    ch.forEach((c, i) => walk(c, depth + 1, i === ch.length - 1, out))
  }
  const working: Placed[] = []
  const done: Placed[] = []
  const roots = kids.get('') ?? []
  const live = roots.filter(subtreeLive)
  const finished = roots.filter(r => !subtreeLive(r)).reverse()
  live.forEach((r, i) => walk(r, 0, i === live.length - 1, working))
  finished.forEach((r, i) => walk(r, 0, i === finished.length - 1, done))
  return { working, done }
}

// The crew's cost, not the session's own: each of this session's agents counts its own
// requests (nested ones included, each once); a side session's status file already
// holds its own subagents, so those rows (`<session>/<agent>`) are not added again.
const totals = (crew: Worker[], at: number) => {
  const cost = crew.filter(w => !w.id.includes('/')).reduce((n, w) => n + (w.costUsd ?? 0), 0)
  const working = crew.filter(isLive).length
  const needsYou = crew.filter(w => w.isWaitingForYou).length
  const first = Math.min(...crew.map(w => w.startedAt), at)
  return { cost, working, needsYou, total: crew.length, time: crew.length ? at - first : 0 }
}

// --- drawings (desktop): each row is one SVG; the title above it is the click target.

const PANE_CSS = `<style>
.t{fill:#1f1f1f}.s{fill:#6b6b68}.m{fill:#9a9a96}.k{fill:#ecebe8}.ln{stroke:#e4e4e1}.tile{fill:#f4f3f0}.tr{stroke:#c9c8c4}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.s{fill:#a8a8a4}.m{fill:#7d7d79}.k{fill:#2c2c2b}.ln{stroke:#333331}.tile{fill:#262625}.tr{stroke:#4a4a48}}
.live{animation:sc-pulse 1.6s ease-in-out infinite}@keyframes sc-pulse{50%{opacity:.3}}
.hand{transform-box:fill-box;transform-origin:50% 100%;animation:sc-wave .9s ease-in-out infinite}@keyframes sc-wave{0%,100%{transform:rotate(-14deg)}50%{transform:rotate(14deg)}}
@media (prefers-reduced-motion: reduce){.live,.hand{animation:none}}
</style>`

const svg = (W: number, H: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${PANE_CSS}${CREW_CSS}${body}</svg>`

const CRAB_SCALE = 1.1
const ROW_H = 46
/** A docked pane is often under 300 px: below this a row takes three lines instead of two. */
const NARROW = 440
const ROW_H_NARROW = 58
const INDENT = 18
const rowHeight = (W: number): number => (W < NARROW ? ROW_H_NARROW : ROW_H)

const statusMark = (x: number, y: number, w: Worker, color: string): string => {
  if (w.isWaitingForYou) return `<circle class="live" cx="${x}" cy="${y}" r="4.5" fill="${HAND}"/>`
  if (w.status === 'running') return `<circle class="live" cx="${x}" cy="${y}" r="3.5" fill="${color}"/>`
  if (w.status === 'waiting') return `<circle cx="${x}" cy="${y}" r="4" fill="none" stroke="${color}" stroke-width="1.4"/>`
  if (w.status === 'done') return `<path d="M${x - 5} ${y}l3.5 3.5 6.5-7" fill="none" stroke="${DONE}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
  return `<path d="M${x - 4} ${y - 4}l8 8M${x + 4} ${y - 4}l-8 8" stroke="${FAIL}" stroke-width="1.8" stroke-linecap="round"/>`
}

// The context's last readings as a small line: it climbs while the worker reads.
const sparkline = (x: number, y: number, w: number, h: number, samples: number[] | undefined, color: string): string => {
  const s = (samples ?? []).filter(n => Number.isFinite(n))
  if (s.length < 2) return ''
  const max = Math.max(...s, 1)
  const pts = s.map((n, i) => `${(x + (i * w) / (s.length - 1)).toFixed(1)},${(y + h - (n / max) * h).toFixed(1)}`).join(' ')
  return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.2" stroke-linejoin="round" opacity=".8"/>`
}

// Model and effort, then what only a session has; a subagent is the default and goes unsaid.
// The desktop drawing marks a session with a chip instead of the word (`withKind` false).
const metaOf = (w: Worker, withKind = true): string => {
  const parts = [w.model ? modelName(w.model) + (w.effort ? ` · ${w.effort}` : '') : '', withKind && w.kind === 'session' ? 'session' : '']
  if (w.branch) parts.push(w.branch)
  if (w.pr) parts.push(w.pr)
  return parts.filter(Boolean).join('  ·  ')
}

const lineOf = (w: Worker): string => {
  if (w.isWaitingForYou) return `✋ needs you${w.waitReason ? ': ' + w.waitReason : ''}`
  if (w.status === 'waiting') return w.kind === 'agent' ? 'waiting for its helpers' : 'idle'
  if (w.status === 'failed') return 'stopped'
  if (w.activity) return w.activity
  if (w.status !== 'running') return ''
  return w.kind === 'session' ? 'working in its own session' : 'starting…'
}

const elapsedOf = (w: Worker, at: number): number => (w.endedAt ?? Math.max(at, w.startedAt)) - w.startedAt

function rowSvg(W: number, p: Placed, at: number): string {
  const { w, depth, isLast } = p
  const role = roleOf(w)
  const color = roleColor(role)
  const x0 = depth * INDENT
  const tx = x0 + 40
  const H = rowHeight(W)
  const isNarrow = W < NARROW
  const ctx = w.contextWindow ? Math.min(100, Math.round((w.tokens / w.contextWindow) * 100)) : 0
  const stats = `${w.tokens ? `${fmtTokens(w.tokens)}${ctx && !isNarrow ? ` (${ctx}%)` : ''}  ` : ''}${w.costUsd !== undefined ? `≈${fmtCost(w.costUsd)}  ` : ''}${fmtTime(elapsedOf(w, at))}`
  const statsW = textWidth(stats, 11)
  const line = lineOf(w)
  const head = roleName(role)
  const headW = textWidth(head, 11) + 8
  // A side session wears a chip after its role: it is a whole session, not a subagent.
  const isSession = w.kind === 'session'
  const chipW = isSession ? textWidth('session', 9) + 12 : 0
  const chip = isSession
    ? `<rect x="${tx + headW}" y="6" width="${chipW}" height="13" rx="6.5" fill="${color}" fill-opacity=".14" stroke="${color}" stroke-width="1"/>
<text x="${tx + headW + chipW / 2}" y="15.5" text-anchor="middle" font-family="${FONT}" font-size="9" font-weight="600" fill="${color}">session</text>`
    : ''
  const metaX = tx + headW + (isSession ? chipW + 6 : 0)
  const meta = metaOf(w, false)
  // Wide: role and model over activity and numbers, the token line at the top right.
  // Narrow: role and model; the activity on a line of its own; numbers and the token line below.
  const metaW = Math.max(0, W - metaX - (isNarrow ? 20 : 80))
  const lineW = isNarrow ? Math.max(0, W - tx - 8) : Math.max(0, W - tx - statsW - 26)
  const lineY = isNarrow ? 32 : 33
  const statsSvg = isNarrow
    ? `<text class="s" x="${tx}" y="48" font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${xml(fitText(stats, 11, Math.max(0, W - tx - 60)))}</text>
${sparkline(W - 50, 39, 42, 10, w.samples, color)}`
    : `<text class="s" x="${W - 22}" y="33" text-anchor="end" font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${xml(stats)}</text>
${sparkline(W - 82, 6, 52, 12, w.samples, color)}`
  const tree =
    depth > 0
      ? `<path class="tr" d="M${x0 - INDENT / 2} 0V${isLast ? 20 : H}M${x0 - INDENT / 2} 20H${x0 - 2}" fill="none" stroke-width="1"/>`
      : ''
  const isWorking = w.status === 'running' && !w.isWaitingForYou
  return svg(
    W,
    H,
    `${tree}${crab(x0, 8, role, { dim: !isLive(w) && !w.isWaitingForYou, isWorking, scale: CRAB_SCALE })}
${w.isWaitingForYou ? `<text class="hand" x="${x0 + 22}" y="12" font-size="14">✋</text>` : ''}
<text x="${tx}" y="16" font-family="${FONT}" font-size="11" fill="${color}" font-weight="600">${xml(head)}</text>${chip}
<text class="s" x="${metaX}" y="16" font-family="${FONT}" font-size="11">${xml(fitText(meta, 11, metaW))}</text>
${line && lineW > 30 ? `<text class="t" x="${tx}" y="${lineY}" font-family="${FONT}" font-size="11"${w.isWaitingForYou ? ` fill="${HAND}" font-weight="600"` : ''}>${xml(fitText(line, 11, lineW))}</text>` : ''}
${statsSvg}
${statusMark(W - 8, 12, w, color)}
<line class="ln" x1="${x0}" y1="${H - 0.5}" x2="${W}" y2="${H - 0.5}"/>`,
  )
}

function headerSvg(W: number, t: ReturnType<typeof totals>): string {
  const gap = 6
  const tw = (W - gap * 2) / 3
  const tile = (i: number, k: string, v: string, color?: string) =>
    `<rect class="tile" x="${i * (tw + gap)}" y="0" width="${tw}" height="40" rx="8"/>
<text class="s" x="${i * (tw + gap) + 9}" y="16" font-family="${FONT}" font-size="11">${k}</text>
<text class="t" x="${i * (tw + gap) + 9}" y="33" font-family="${FONT}" font-size="15" font-weight="600" font-variant-numeric="tabular-nums"${color ? ` fill="${color}"` : ''}>${v}</text>`
  const crewText = t.needsYou ? `${t.working}/${t.total} · ✋${t.needsYou}` : `${t.working}/${t.total}`
  return svg(W, 44, `${tile(0, 'On site', crewText, t.needsYou ? HAND : undefined)}${tile(1, 'Crew cost', '≈' + fmtCost(t.cost))}${tile(2, 'Time', fmtTime(t.time))}`)
}

function stripSvg(W: number, crew: Worker[], t: ReturnType<typeof totals>): string {
  const live = crew.filter(w => isLive(w) || w.isWaitingForYou)
  const step = 34
  const text = `${t.working} on site${t.needsYou ? ` · ✋ ${t.needsYou} need${t.needsYou === 1 ? 's' : ''} you` : ''} · ≈${fmtCost(t.cost)}`
  const room = Math.max(1, Math.floor((W - textWidth(text, 12) - 24) / step))
  const shown = live.slice(0, room)
  const more = live.length - shown.length
  const crabs = shown
    .map((w, i) => crab(i * step, 1, roleOf(w), { isWorking: w.status === 'running' && !w.isWaitingForYou, scale: 1 }) + (w.isWaitingForYou ? `<circle class="live" cx="${i * step + 30}" cy="4" r="3" fill="${HAND}"/>` : ''))
    .join('')
  const x = shown.length * step + (more ? 2 : 0)
  return svg(
    W,
    30,
    `${crabs}${more ? `<text class="s" x="${x}" y="20" font-family="${FONT}" font-size="12">+${more}</text>` : ''}
<text class="s" x="${W}" y="20" text-anchor="end" font-family="${FONT}" font-size="12" font-variant-numeric="tabular-nums">${xml(text)}</text>`,
  )
}

const STATUS_GLYPH: Record<WorkerStatus, string> = { running: '●', waiting: '○', done: '✓', failed: '✕' }

// ---------------------------------------------------------------------------

export const register: Register = (on, options) => {
  autoOpen = (options as { autoOpen?: string } | undefined)?.autoOpen !== 'no'

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    hostId = (await $.env.get('CLAUDE_CODE_HOST_SESSION_ID')) ?? ''
    const home = ((await $.env.get('USERPROFILE')) || (await $.env.get('HOME')) || '.').replace(/\\/g, '/')
    const conf = ((await $.env.get('CLAUDE_CONFIG_DIR')) || `${home}/.claude`).replace(/\\/g, '/')
    statusDir = `${conf}/site-crew/sessions`
    if (hostId) {
      // A session another one started writes a status file for it.
      const self = (await mcpJson($, 'ccd_session_mgmt', 'get_session', { session_id: 'self' }).catch(() => undefined)) as
        | { parentSessionId?: string }
        | undefined
      parentId = self?.parentSessionId ?? ''
      await publish($, 'idle')
    }
    await $.command.register({ name: 'crew', description: 'Show or hide the site crew: every subagent and side session this session started' })

    let tick = 0
    let isBusy = false
    $.clock.every(1000, () => {
      void (async () => {
        if (isBusy) return
        isBusy = true
        try {
          tick++
          const at = await $.clock.now()
          const crew = await read($, crewAtom)
          const anyLive = crew.some(w => isLive(w) || w.isWaitingForYou)
          // Subagents: every 2 s while any is on site, and every 10 s otherwise, so agents
          // started before this module loaded (a reload, a resume) still join.
          if ((anyLive && tick % 2 === 0) || tick % 10 === 0) {
            const before = crew.length
            await syncAgents($, at)
            if ((await read($, crewAtom)).length > before) await maybeAutoOpen($)
          }
          // Side sessions: every 5 s while one is running, every 15 s otherwise (a card may start one).
          const hasSessions = crew.some(w => w.kind === 'session')
          if (hostId && (tick % (hasSessions && anyLive ? 5 : 15) === 0)) {
            const before = crew.filter(w => w.kind === 'session').length
            await syncSessions($, at)
            const after = (await read($, crewAtom)).filter(w => w.kind === 'session').length
            if (after > before) await maybeAutoOpen($)
          }
          if (hasSessions && tick % 2 === 0) await readStatusFiles($)
          // A started session's status file, for its parent: cost and agents move while it runs.
          if (tick % 5 === 0 && parentId && mine.state !== 'idle') await publish($)
          if (anyLive && tick % 2 === 0) await update($, nowAtom, () => at)
        } finally {
          isBusy = false
        }
      })()
    })

    // The pane comes back with the session when it was open.
    const p = await read($, panelAtom)
    if (p.isOpen && (await read($, crewAtom)).length) await $.ui.open({ id: PANE, title: 'Site crew' }).catch(() => undefined)
    return started
  })

  on('command.run', { command: 'crew' }, async ($, e) => {
    if ((e.args ?? '').trim() === 'open') {
      await openPane($)
      return { text: 'Site crew opened.' }
    }
    const isOpen = await togglePane($)
    return { text: isOpen ? 'Site crew opened.' : 'Site crew closed.' }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    if (e.origin.kind !== 'unload') await update($, panelAtom, p => ({ ...p, isOpen: false }))
    return closed
  })

  // A new subagent shows at once, under the agent that started it.
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    try {
      if (started.deny === undefined && started.agentId) {
        const at = await $.clock.now()
        lastSeen.set(started.agentId, at)
        await upsert($, [
          {
            id: started.agentId,
            kind: 'agent',
            parent: e.parentAgentId ?? '',
            title: clip(e.description || e.subagentType || 'agent', MAX_TITLE),
            type: e.subagentType || 'general-purpose',
            model: started.model,
            status: 'running',
            startedAt: at,
            tokens: 0,
          },
        ])
        await update($, nowAtom, () => at)
        await maybeAutoOpen($)
      }
    } catch {
      // the panel's bookkeeping never gets in a spawn's way
    }
    return started
  })

  // What each agent is doing: its last tool call. Kept aside; the poll draws it.
  on('tool.call', async ($, e, next) => {
    if (e.agentId && !QUIET_TOOLS.test(e.tool)) {
      try {
        activities.set(e.agentId, activityOf(e.tool, e as unknown as Record<string, unknown>))
      } catch {
        // never in a tool call's way
      }
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    try {
      if (e.agentId) {
        const at = await $.clock.now()
        const crew = await read($, crewAtom)
        const w = crew.find(x => x.id === e.agentId)
        if (w) await upsert($, [{ ...w, status: e.reason === 'answer' ? 'done' : 'failed', endedAt: at }])
        await syncAgents($, at)
      } else {
        await publish($, 'idle')
      }
    } catch {
      // bookkeeping only
    }
    return done
  })

  // This session's own state, for a parent that watches it.
  on('turn.start', async ($, e, next) => {
    if (!e.agentId) await publish($, 'running')
    return next(e)
  })

  on('classic.PermissionRequest', async ($, e, next) => {
    const what = str((e.tool_input as Record<string, unknown> | undefined)?.command) ?? str((e.tool_input as Record<string, unknown> | undefined)?.file_path)
    await publish($, 'waiting', clip(`${String(e.tool_name).replace(/^mcp__/, '')}${what ? ': ' + what : ''}`, MAX_TITLE))
    return next(e)
  })

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    const q = (e as unknown as { questions?: { question?: string }[] }).questions?.[0]?.question
    await publish($, 'waiting', clip(q?.trim() || 'a question', MAX_TITLE))
    try {
      return await next(e)
    } finally {
      await publish($, 'running')
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const crew = await read($, crewAtom)
    const p: Panel = await read($, panelAtom)
    const at = Math.max(await read($, nowAtom), ...crew.map(w => w.startedAt), 0)
    const t = totals(crew, at)
    const { working, done } = layTree(crew)

    // A nested worker's title says whose helper it is; its drawing below is indented.
    const titleOf = (w: Worker, depth = 0) => {
      const text = `${depth ? '  '.repeat(depth - 1) + '↳ ' : ''}${w.isWaitingForYou ? '✋ ' : ''}${w.title}`
      const hover = { scope: `w-${w.id}`.slice(0, 64), color: roleColor(roleOf(w)), bold: true }
      if (w.kind === 'session') return <Button key={`t-${w.id}`} label={text} plain hover={hover} onPress={() => void openSession($, w.id)} />
      if (w.id.includes('/')) return <Button key={`t-${w.id}`} label={text} plain hover={hover} onPress={() => void openSession($, w.id.split('/')[0] ?? '')} />
      return <Button key={`t-${w.id}`} label={text} plain hover={hover} onPress={() => void $.ui.view({ agentId: w.id })} />
    }
    const toggleCompact = (
      <Button key="compact" label={p.isCompact ? 'Expand' : 'Collapse'} plain onPress={() => update($, panelAtom, prev => ({ ...prev, isCompact: !prev.isCompact }))} />
    )
    const toggleDone = (
      <Button
        key="done"
        label={`${p.isDoneCollapsed ? '▸' : '▾'} Finished · ${done.length}`}
        plain
        onPress={() => update($, panelAtom, prev => ({ ...prev, isDoneCollapsed: !prev.isDoneCollapsed }))}
      />
    )
    const isEmpty = crew.length === 0
    const shown = [...working, ...(p.isDoneCollapsed ? [] : done)]

    if (e.surface === 'desktop' && 'Svg' in ui) {
      const { Svg } = ui
      const W = Math.max(260, Math.min(900, (e.props.bodyColumns || 44) * 8 - 8))
      if (p.isCompact) {
        return (
          <Box flexDirection="column" gap={1}>
            <Svg source={stripSvg(W, crew, t)} alt={`${t.working} working, ${t.needsYou} need you`} width={W} height={30} />
            {toggleCompact}
          </Box>
        )
      }
      const heroes = new Set(shown.slice(0, HERO_ROWS).map(x => x.w.id))
      const row = (x: Placed) => (
        <Box key={`r-${x.w.id}`} flexDirection="column" hover={{ scope: `w-${x.w.id}`.slice(0, 64) }}>
          {titleOf(x.w, x.depth)}
          {heroes.has(x.w.id) ? (
            <Svg
              source={rowSvg(W, { ...x }, at)}
              alt={`${x.w.title}: ${roleName(roleOf(x.w))}, ${x.w.status}`}
              width={W}
              height={rowHeight(W)}
            />
          ) : (
            <Text dimColor wrap="truncate-end">
              {STATUS_GLYPH[x.w.status]} {roleName(roleOf(x.w))} · {metaOf(x.w)} · {fmtTime(elapsedOf(x.w, at))}
            </Text>
          )}
        </Box>
      )
      return (
        <Box flexDirection="column">
          <Svg source={headerSvg(W, t)} alt={`${t.working} of ${t.total} on site, about ${fmtCost(t.cost)}`} width={W} height={44} />
          {toggleCompact}
          {isEmpty && <Text dimColor>No crew yet: subagents and side sessions this session starts show up here.</Text>}
          {working.length > 0 && <Text dimColor>On site · {working.length}</Text>}
          {working.map(row)}
          {done.length > 0 && toggleDone}
          {!p.isDoneCollapsed && done.map(row)}
        </Box>
      )
    }

    // Terminal: the same tree in text.
    const line = (x: Placed) => {
      const role = roleOf(x.w)
      const pad = '  '.repeat(x.depth)
      return (
        <Box key={`r-${x.w.id}`} flexDirection="column">
          <Box flexDirection="row" gap={1}>
            <Text>{pad}</Text>
            <Text color={x.w.isWaitingForYou ? HAND : roleColor(role)}>{x.w.isWaitingForYou ? '✋' : STATUS_GLYPH[x.w.status]}</Text>
            {titleOf(x.w, x.depth)}
          </Box>
          <Text dimColor wrap="truncate-end">
            {pad}
            {'  '}
            {roleName(role)} · {metaOf(x.w)} · {x.w.costUsd !== undefined ? `≈${fmtCost(x.w.costUsd)} · ` : ''}
            {fmtTime(elapsedOf(x.w, at))}
            {lineOf(x.w) ? ` · ${lineOf(x.w)}` : ''}
          </Text>
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold>
            On site {t.working}/{t.total}
            {t.needsYou ? ` · ✋ ${t.needsYou}` : ''} · ≈{fmtCost(t.cost)} · {fmtTime(t.time)}
          </Text>
          {toggleCompact}
        </Box>
        {isEmpty && <Text dimColor>No crew yet.</Text>}
        {!p.isCompact && working.map(line)}
        {!p.isCompact && done.length > 0 && toggleDone}
        {!p.isCompact && !p.isDoneCollapsed && done.map(line)}
      </Box>
    )
  })

  // A thin strip above the prompt while anyone is on site.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const crew = await read($, crewAtom)
    const live = crew.filter(w => isLive(w) || w.isWaitingForYou)
    if (!live.length || e.props.hasSurvey) return next(e)
    const drawn = await Promise.resolve(next(e)).catch(() => null)
    const below = drawn && typeof drawn === 'object' && (drawn as { type?: string }).type !== 'engine' ? drawn : null
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const t = totals(crew, Math.max(await read($, nowAtom), 0))
    const open = <Button key="crew" label="Crew" plain onPress={() => void togglePane($)} />
    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const { Svg } = ui
      const width = Math.max(180, Math.min(1600, (e.props.bodyColumns || 100) * 8 - 90))
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" alignItems="center" gap={1}>
            <Svg source={stripSvg(width, crew, t)} alt={`${t.working} on site`} width={width} height={30} />
            {open}
          </Box>
          {below}
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text color="#C8651B">▣</Text>
          <Text>
            {t.working} on site{t.needsYou ? ` · ✋ ${t.needsYou}` : ''} · ≈{fmtCost(t.cost)}
          </Text>
          {open}
        </Box>
        {below}
      </Box>
    )
  })
}

// Exported for the tests.
export const _internal = { roleOf, layTree, activityOf, modelName, CRAB_BOX }
