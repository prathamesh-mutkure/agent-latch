# Commands

Run from the repo root.

## Local stack

```sh
bun install
cp .env.example .env
bun run infra:up
bun run dev
```

`bun run dev` starts the web app, the API, and the background agent. The API applies SQL migrations when it starts.

- Web: http://localhost:5173
- API: http://localhost:3001/health

## One process

```sh
bun --filter @agentlatch/web dev
bun --filter @agentlatch/api dev
bun --filter @agentlatch/agent dev
```

## Background agent

`bun run dev` already starts it. To run only the agent, with Postgres and the API already up:

```sh
bun --filter @agentlatch/agent dev
```

It reuses an agent named `trader`, sets the 500/5000 USDC policy, and cycles three mocked swaps: 100 USDC (allow), 2500 USDC (waits for approval), 10000 USDC (block). It does not approve itself.

```sh
# while it is waiting on the 2500 USDC swap
curl -X POST "http://localhost:3001/approvals/<approvalId>/approve"
curl -X POST "http://localhost:3001/approvals/<approvalId>/reject"
```

Env, all optional:

```sh
API_URL=http://localhost:3001
AGENT_NAME=trader
AGENT_INTERVAL_MS=10000
AGENT_POLL_MS=2000
```

## Database

```sh
bun run infra:up
bun run infra:down
bun run infra:reset
bun run db:generate
bun run db:migrate
```

`infra:reset` deletes the Postgres volume, starts it again, and migrates. Starting the API also migrates, so `db:migrate` is only needed when you want to apply SQL without booting the API.

## Checks

```sh
bun run typecheck
bun run lint
```
