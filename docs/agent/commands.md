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

While it waits on the 2500 USDC swap, only the agent's owner can decide, in World App (see below). There is no curl approve. The agent's reads stay open:

```sh
curl "http://localhost:3001/approvals/<approvalId>"
```

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

## World App

World App must open the web app on a public HTTPS host, and that host proxies `/api` to the API. Live, that is Vercel with the rewrite in `apps/web/vercel.json`:

```json
{ "source": "/api/(.*)", "destination": "https://<api-host>/$1" }
```

For a local API behind ngrok:

```sh
ngrok http 3001
# put the https host in apps/web/vercel.json, then redeploy apps/web
```

Set the Developer Portal mini app URL to that web host. Set `WORLD_APP_ID` and `WORLD_NOTIFICATION_API_KEY` in `.env` for the API. `WORLDCHAIN_RPC_URL` is optional.

World ID for Agents needs a confidential client from `https://sandbox.auth.world.org/portal`, registered with an HTTPS callback (device clients still need one) and `client_secret_basic`. Set these for the API only:

```sh
WORLD_OIDC_ISSUER=https://sandbox.auth.world.org
WORLD_CLIENT_ID=<portal client id>
WORLD_CLIENT_SECRET=<from the portal, backend only>
```

`GET /world/config` returns `worldIdReady: true` when all three are set.

On the phone: open the mini app in World App, tap Claim on the agent, sign, and allow notifications. When the agent goes past its rules, the push opens `/approve/<id>`. Deny: tap Deny and sign. Approve: tap Approve with World ID and sign, then tap Open World ID, check the code, and tap Authenticate with World ID. The action runs once the API has validated World's token. Tapping Deny sign-in on World ID rejects the approval. The desktop dashboard shows the same approval with a "Decide in World App" link.

## Checks

```sh
bun run typecheck
bun run lint
```
