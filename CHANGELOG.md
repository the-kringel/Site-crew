# Changelog

## 0.1.0 — 2026-11-27

First release.

- A live panel (`/crew`) and a strip above the prompt with every subagent and side session the session starts, nested the way they start each other, at any depth.
- Each worker is a construction-crew crab on a capability ladder: the model sets the band and effort climbs within it. Apprentice (Haiku), Laborer (Sonnet low/medium), Bricklayer (Sonnet high+ or Opus low), Carpenter (Opus medium), Foreman (Opus high), Engineer (Opus xhigh/max), Architect (Fable). Four roles go by job: the Inspector for testers and reviewers, the Surveyor for Explore agents, the Planner for Plan agents and the Subcontractor for other models.
- Built on what Claude Code and the desktop app report by themselves: the engine's agent list (parent, model, effort, live context, cost as `/cost` counts it), spawn events, each agent's tool calls, and the app's linked sessions (`startedBy`). No system-prompt section and no reporting tool. A started session writes one small status file for its parent, so a session waiting for you raises its hand and shows its cost and its own subagents.
- A docked pane gets three-line rows so nothing important is cut off; side sessions wear a `session` chip; the header shows the crew's cost, not the orchestrator's own.
