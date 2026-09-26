# AgentLatch

Control plane for autonomous agents. Agents get bounded authority. Every privileged action is allowed, blocked, or sent for fresh human approval.

Product direction lives in [`docs/agent/planning.md`](docs/agent/planning.md). What is actually built, and which choices are closed, lives next to it. Coding agents start at [`AGENTS.md`](AGENTS.md). Claude Code loads [`CLAUDE.md`](CLAUDE.md), which points at that same file.

## Run

```sh
bun install
cp .env.example .env
bun run infra:up
bun run dev
```

The API applies database migrations on startup. More commands, including how to run the agent alone, are in [`docs/agent/commands.md`](docs/agent/commands.md).

- Web: http://localhost:5173
- API health: http://localhost:3001/health
- Agent: background process started by `bun run dev`

The API stores agents, policies, actions, approvals, and an audit log in Postgres. `POST /agents/:id/actions` returns allow, block, or an approval id. An approval pushes to the agent's owner in World App. The owner denies with a wallet signature bound to that one action. To approve, they sign and then complete a fresh World ID for Agents check. The API validates World's token before the action runs. The integration debrief is [`docs/world-id-debrief.md`](docs/world-id-debrief.md). The timeline is `GET /agents/:id/audit`. Field details are in `docs/agent/current-state.md`. The World App setup is in [`docs/agent/commands.md`](docs/agent/commands.md).

```sh
bun run typecheck
bun run lint
```

## Layout

Runnable apps are `apps/web`, `apps/api`, and `apps/agent`. `@agentlatch/core` is the shared domain package. Later modules are directories with `.gitkeep` only.

## Team handoff

Before starting work, read `docs/agent/current-state.md`. Before handing off, update that file in the same change. Settled choices go in `docs/agent/decisions.md`.
