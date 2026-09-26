# AgentLatch

Control plane for autonomous agents. Agents get bounded authority. Every privileged action is allowed, blocked, or sent for fresh human approval.

Product direction lives in [`docs/agent/planning.md`](docs/agent/planning.md). What is actually built, and which choices are closed, lives next to it. Coding agents start at [`AGENTS.md`](AGENTS.md). Claude Code loads [`CLAUDE.md`](CLAUDE.md), which points at that same file.

## Run

```sh
bun install
cp .env.example .env
bun run infra:up
bun run db:migrate
bun run dev
```

- Web: http://localhost:5173
- API health: http://localhost:3001/health
- Agent process stays idle until Phase 3

The API stores agents, policies, actions, approvals, and an audit log in Postgres. `PUT /agents/:id/policy` sets USDC limits. `POST /agents/:id/actions` returns allow, block, or an approval id. Approve or reject at `POST /approvals/:id/approve` and `POST /approvals/:id/reject`. The timeline is `GET /agents/:id/audit`. Field details are in `docs/agent/current-state.md`.

```sh
bun run typecheck
bun run lint
```

## Layout

Runnable apps are `apps/web`, `apps/api`, and `apps/agent`. `@agentlatch/core` is the shared domain package. Later modules are directories with `.gitkeep` only.

## Team handoff

Before starting work, read `docs/agent/current-state.md`. Before handing off, update that file in the same change. Settled choices go in `docs/agent/decisions.md`.
