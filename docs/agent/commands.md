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

`GET /agents/:id` adds an `ens` object read from Sepolia ENSv2. Register the agent's label with:

```sh
curl -X POST "http://localhost:3001/agents/<agentId>/ens"
```

That requires `EXECUTOR_PRIVATE_KEY` for the owner of `ENS_PARENT_NAME` (default `agent-latch.eth`) and Sepolia ETH for gas. The route deploys a UserRegistry if the parent has none, links it with `setSubregistry` and `setParent`, then registers the agent label.

```sh
# while it is waiting on the 2500 USDC swap
curl -X POST "http://localhost:3001/approvals/<approvalId>/approve"
curl -X POST "http://localhost:3001/approvals/<approvalId>/reject"
```

The dashboard at http://localhost:5173 calls those same routes.

`X402_PAYMENT` screens `target` with the Intercepta quick scan before execution. Set `INTERCEPTA_API_KEY`. A missing key refuses the payment. Swaps do not call Intercepta.

`GET /x402/resource` returns 402 with the Sepolia USDC requirements. Pay that quote with an action. Amount `0.01` is under the autonomous limit, so a clear payee is settled immediately. `EXECUTOR_PRIVATE_KEY` must hold Sepolia ETH for gas and Circle USDC for the transfer.

```sh
curl -sS -D - "http://localhost:3001/x402/resource"
# after a signed settlement
curl -sS "http://localhost:3001/x402/resource?tx=<txHash>"
curl -X POST "http://localhost:3001/agents/<agentId>/actions" \
  -H "content-type: application/json" \
  -d '{"action":"X402_PAYMENT","target":"<payTo from the 402>","amount":"0.01"}'
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
