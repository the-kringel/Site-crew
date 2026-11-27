import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { _internal } from './register.tsx'

const PLUGIN = 'site-crew'
const HOST = 'local_b9f6dc8a-d0ab-4fdd-a609-846bff1ef252'
const CHILD = 'local_014da006-e133-4607-9a12-362cd1d5cd65'
const GRANDCHILD = 'local_7c1d2e3f-1111-4222-8333-944455556666'
const STRANGER = 'local_00000000-aaaa-4bbb-8ccc-dddddddddddd'
const NOW = Date.parse('2026-11-27T12:00:00Z')
const pane = { title: '', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const

type Call = { server: string; tool: string; args: Record<string, unknown> }

// `own` names the mocks a test registers itself: the harness takes one per event.
const base = (on: On, env: Record<string, string> = {}, own: string[] = []) => {
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, { USERPROFILE: 'C:\\Users\\me', ...env })
  const add = (event: string, hook: (...args: never[]) => unknown) => {
    if (!own.includes(event)) (on as unknown as (e: string, h: unknown) => void)(event, hook)
  }
  add('session.start', async () => ({ cwd: '/repo' }))
  add('session.model', async () => ({ value: 'claude-opus-5-5' }))
  add('session.usage', async () => ({ value: { startedAt: NOW, context: { tokens: 1000, window: 1_000_000, percent: 0 }, rateLimits: [], cost: { usd: 1.5 } } }))
  add('ui.open', async () => ({ value: { isPlaced: true } }))
  add('ui.panes', async () => ({ value: [] }))
  add('ui.notify', async () => ({ value: {} }))
  add('command.register', async () => ({ value: undefined }))
  add('fs.write', async () => ({ value: undefined }))
  add('fs.stat', async () => {
    throw new Error('ENOENT')
  })
  add('turn.start', async () => ({ turnId: 't1' }))
  add('turn.complete', async () => ({ text: '' }))
  add('tool.call', async () => ({ result: 'ok' }))
  add('classic.PermissionRequest', async () => ({}))
  return clock
}

const start = ($: Engine) => $.session.start({ source: 'startup', cwd: '/repo', surface: 'terminal', isInteractive: true } as never)

const spawn = ($: Engine, agentId: string, description: string, subagentType: string, parentAgentId?: string) =>
  $.agent.spawn({
    tool_use_id: `tu-${agentId}`,
    prompt: 'p',
    description,
    subagentType,
    provider: 'engine',
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
    ...(parentAgentId ? { parentAgentId } : {}),
  } as never)

const mcpReply = (value: unknown) => ({ value: { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }], isError: false } }) as never

const agentRow = (over: Record<string, unknown>) => ({
  id: 'a1',
  description: 'Build the parser',
  type: 'general-purpose',
  status: 'running',
  kind: 'local_agent',
  taskStatus: 'running',
  label: 'Build the parser',
  startTime: NOW,
  cwd: '/repo',
  model: 'claude-opus-5-5',
  tokenCount: 0,
  tokenSamples: [0],
  hasRow: true,
  ...over,
})

test('roles climb a capability ladder: the model sets the band, effort climbs within it', () => {
  const r = (model: string, effort?: string, type = 'general-purpose') => _internal.roleOf({ model, effort, type })
  expect(r('claude-haiku-5-5', 'high')).toBe('apprentice')
  expect(r('claude-sonnet-5-5', 'low')).toBe('laborer')
  expect(r('claude-sonnet-5-5', 'medium')).toBe('laborer')
  expect(r('claude-sonnet-5-5')).toBe('laborer')
  expect(r('claude-sonnet-5-5', 'high')).toBe('bricklayer')
  expect(r('claude-sonnet-5-5', 'max')).toBe('bricklayer')
  expect(r('claude-opus-5-5', 'low')).toBe('bricklayer')
  expect(r('claude-opus-5-5', 'medium')).toBe('carpenter')
  expect(r('claude-opus-5-5')).toBe('carpenter')
  expect(r('claude-opus-5-5', 'high')).toBe('foreman')
  expect(r('claude-opus-5-5', 'xhigh')).toBe('engineer')
  expect(r('claude-opus-5-5', 'max')).toBe('engineer')
  expect(r('claude-fable-5-2', 'low')).toBe('architect')
  expect(r('gemini-4-neon-high')).toBe('sub')
  // Every Opus rung from medium up sits above every Sonnet rung.
  const ladder = ['apprentice', 'laborer', 'bricklayer', 'carpenter', 'foreman', 'engineer', 'architect']
  const rung = (m: string, e?: string) => ladder.indexOf(r(m, e))
  expect(rung('claude-opus-5-5', 'low')).toBeGreaterThan(rung('claude-sonnet-5-5', 'medium'))
  expect(rung('claude-opus-5-5', 'medium')).toBeGreaterThan(rung('claude-sonnet-5-5', 'max'))
})

test('some roles go by job: testers and reviewers inspect, Explore surveys, Plan plans', () => {
  const r = (type: string, model = 'claude-sonnet-5-5', effort = 'high') => _internal.roleOf({ model, effort, type })
  expect(r('savvy-flow:savvy-tester')).toBe('inspector')
  expect(r('code-reviewer', 'claude-opus-5-5')).toBe('inspector')
  expect(r('security-review')).toBe('inspector')
  expect(r('latest-news')).toBe('bricklayer')
  expect(r('Explore', 'claude-haiku-5-5')).toBe('surveyor')
  expect(r('Plan', 'claude-opus-5-5')).toBe('planner')
})

test('a nested subagent sits under the agent that started it', async ($, on) => {
  base(on)
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: ++n === 1 ? 'a1' : 'a2' }) as never)
  await start($)
  await spawn($, 'a1', 'Search the repo', 'general-purpose')
  await spawn($, 'a2', 'Find tierFor', 'Explore', 'a1')
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'site-crew', props: pane })
  expect(await ui.find({ key: 't-a1' })).toBeDefined()
  const nested = await ui.find({ key: 't-a2' })
  expect(nested).toBeDefined()
  expect(JSON.stringify(nested)).toContain('↳ Find tierFor')
  expect(await ui.find({ type: 'Text', text: /Surveyor/ })).toBeDefined()
  await ui.unmount()
})

test("the engine's agent list sets the role, the cost and the end", async ($, on) => {
  const clock = base(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }) as never)
  let rows = [agentRow({ model: 'claude-sonnet-5-5', effort: 'high', tokenCount: 52_000, tokenSamples: [0, 52_000], contextWindowSize: 1_000_000, cost: { usd: 0.42 } })]
  on('agent.list', async () => ({ value: rows }) as never)
  await start($)
  await spawn($, 'a1', 'Build the parser', 'general-purpose')
  await clock.advance(2000)
  let ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'site-crew', props: pane })
  expect(await ui.find({ type: 'Text', text: /Bricklayer/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /≈\$0\.42/ })).toBeDefined()
  await ui.unmount()

  // Gone from the engine's list: the agent has finished.
  rows = []
  await clock.advance(6000)
  ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'site-crew', props: pane })
  expect(await ui.find({ key: 'done' })).toBeDefined()
  await ui.unmount()
})

test('side sessions nest by who started them, and a waiting status file raises the hand', async ($, on) => {
  const clock = base(on, { CLAUDE_CODE_HOST_SESSION_ID: HOST }, ['fs.stat', 'ui.notify'])
  const calls: Call[] = []
  on('mcp.call', async (_$, e) => {
    const c = e as unknown as Call
    calls.push(c)
    if (c.tool === 'list_sessions') {
      return mcpReply([
        { sessionId: CHILD, title: 'Ring IV balance', isRunning: true, startedBy: HOST, name: 'r4', branch: 'claude/r4', prNumber: 41, prState: 'OPEN' },
        { sessionId: GRANDCHILD, title: 'Tune the gates', isRunning: true, startedBy: CHILD, name: 'gates' },
        { sessionId: STRANGER, title: 'Someone else', isRunning: true, startedBy: 'local_99999999-aaaa-4bbb-8ccc-dddddddddddd' },
      ])
    }
    if (c.tool === 'get_session') return mcpReply(c.args.session_id === 'self' ? { sessionId: HOST } : { model: 'claude-opus-5-5', effort: 'high' })
    return mcpReply('ok')
  })
  const file = {
    hostId: CHILD,
    parentId: HOST,
    state: 'waiting',
    reason: 'Bash: npm publish',
    costUsd: 2.25,
    agents: [{ id: 'x1', kind: 'agent', parent: '', title: 'Check the build', type: 'Explore', status: 'running', startedAt: NOW, tokens: 0 }],
    updatedAt: NOW,
  }
  on('fs.stat', async (_$, e) => {
    if (String((e as unknown as { path: string }).path).includes(CHILD)) return { value: { kind: 'file', size: 1, mtimeMs: 1, isLink: false } } as never
    throw new Error('ENOENT')
  })
  on('fs.read', async () => ({ value: JSON.stringify(file) }) as never)
  const notified: string[] = []
  on('ui.notify', async (_$, e) => {
    notified.push((e as unknown as { text: string }).text)
    return { value: {} } as never
  })
  await start($)
  await clock.advance(16_000)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: 'site-crew', props: pane })
  expect(await ui.find({ key: `t-${CHILD}` })).toBeDefined()
  expect(JSON.stringify(await ui.find({ key: `t-${GRANDCHILD}` }))).toContain('↳ Tune the gates')
  expect(await ui.find({ key: `t-${CHILD}/x1` })).toBeDefined()
  expect(await ui.find({ key: `t-${STRANGER}` })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /needs you: Bash: npm publish/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Foreman/ })).toBeDefined()
  expect(notified.filter(t => t.includes('Ring IV balance'))).toHaveLength(1)

  // A session's title opens it in the app.
  await ui.press({ key: `t-${CHILD}` })
  expect(calls.some(c => c.server === 'ccd_window' && c.tool === 'open_session_in' && c.args.session_id === CHILD)).toBe(true)
  await ui.unmount()
})

test('a started session tells its parent when it runs, waits and goes idle', async ($, on) => {
  base(on, { CLAUDE_CODE_HOST_SESSION_ID: CHILD }, ['fs.write'])
  on('mcp.call', async (_$, e) => {
    const c = e as unknown as Call
    if (c.tool === 'get_session') return mcpReply({ sessionId: CHILD, parentSessionId: HOST })
    return mcpReply('No other sessions found.')
  })
  const files = new Map<string, Record<string, unknown>>()
  on('fs.write', async (_$, e) => {
    const { path, text } = e as unknown as { path: string; text: string }
    files.set(path.split('\\').join('/'), JSON.parse(text) as Record<string, unknown>)
    return { value: undefined } as never
  })
  const status = () => files.get(`C:/Users/me/.claude/site-crew/sessions/${CHILD}.json`)
  await start($)
  expect(status()).toMatchObject({ state: 'idle', parentId: HOST })

  await $.turn.start({ turnId: 't1', text: 'go' } as never)
  expect(status()?.state).toBe('running')

  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'git push origin main' } } as never)
  expect(status()).toMatchObject({ state: 'waiting', reason: 'Bash: git push origin main' })

  await $.turn.complete({ turnId: 't1', answer: 'done', durationMs: 1, isAborted: false, reason: 'answer', text: 'done' } as never)
  expect(status()?.state).toBe('idle')
})

test("a subagent's title opens its transcript", async ($, on) => {
  base(on)
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'a7' }) as never)
  const viewed: unknown[] = []
  on('ui.view', async (_$, e) => {
    viewed.push(e)
    return { value: {} } as never
  })
  await start($)
  await spawn($, 'a7', 'Fix the parser', 'general-purpose')
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'site-crew', props: pane })
    await ui.press({ key: 't-a7' })
    await ui.unmount()
  }
  expect(viewed).toEqual([{ agentId: 'a7' }, { agentId: 'a7' }])
})
