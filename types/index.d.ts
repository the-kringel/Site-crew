// site-crew's $.state contract.

/** running: working; waiting: paused on its own helpers (or a teammate between turns); done; failed. */
export type WorkerStatus = 'running' | 'waiting' | 'done' | 'failed'

/** One subagent or side session on the site, wherever it sits in the tree. */
export type Worker = {
  /** A subagent's engine id; a side session's app id (`local_…`); a side session's own subagent as `<session id>/<agent id>`. */
  id: string
  kind: 'agent' | 'session'
  /** '' when this session started it; otherwise the id of the worker that did. */
  parent: string
  title: string
  /** The agent type (`general-purpose`, `Explore`, ...), or `session`. */
  type: string
  model?: string
  /** The effort it runs at, as the engine or the app reports it. */
  effort?: string
  status: WorkerStatus
  /** A side session waits for the person: a permission dialog or a question. */
  isWaitingForYou?: boolean
  waitReason?: string
  startedAt: number
  endedAt?: number
  /** Tokens in its context now. */
  tokens: number
  contextWindow?: number
  /** Its last token readings, oldest first (the engine keeps 16, about 5 s apart). */
  samples?: number[]
  /** Dollars as `/cost` counts them (an estimate, not a bill). */
  costUsd?: number
  /** What it is doing: the engine's progress summary, else its last tool call. */
  activity?: string
  branch?: string
  /** A side session's pull request, as `#12 open`. */
  pr?: string
  /** Opens a side session in the app. */
  link?: string
}

export type Panel = {
  /** The pane is wanted: opened and not closed by the person since. */
  isOpen: boolean
  isCompact: boolean
  isDoneCollapsed: boolean
  /** The pane already opened by itself once in this session. */
  hasAutoOpened: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'site-crew': {
      crew: Worker[]
      panel: Panel
      now: number
    }
  }
}
