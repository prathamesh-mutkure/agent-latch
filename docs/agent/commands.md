# Commands

Run from the repo root. A public API and hosted Postgres are in [`deploy.md`](deploy.md). The commands below stay on this machine.

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

It acts for the agent in `AGENT_ID` and sends `AGENT_KEY` as `x-agent-key`. It cycles three swaps: 0.2 USDC (allow), 0.5 USDC (waits for approval), 2 USDC (block). It does not approve itself, list agents, create agents, or change policy. Without `AGENT_ID` and `AGENT_KEY` it idles. Copy both from the agent's page. The key is shown once.

Owner routes need a session: `Authorization: Bearer <token>`. Sign in on the dashboard, then copy the token from local storage key `dsap.session` (field `token`). `GET /agents/:id` adds an `ens` object read from Sepolia ENSv2. Register the agent's label with:

```sh
curl -X POST "http://localhost:3001/agents/<agentId>/ens" \
  -H "authorization: Bearer <token>"
```

That requires `EXECUTOR_PRIVATE_KEY` for the owner of `ENS_PARENT_NAME` (default `agent-latch.eth`) and Sepolia ETH for gas. The route deploys a UserRegistry if the parent has none, links it with `setSubregistry` and `setParent`, then registers the agent label.

While it waits on the 0.5 USDC swap, only the agent's owner can decide, in World App (see below). There is no curl approve. The agent's reads stay open:

```sh
curl "http://localhost:3001/approvals/<approvalId>"
```

`X402_PAYMENT` takes the resource URL as `target`. The API gets the 402 quote, and the amount must match it exactly. Intercepta screens the quote's `payTo` before anything is signed. Set `INTERCEPTA_API_KEY`. A missing key refuses the payment. Intercepta is not called for other actions.

`TOKEN_TRANSFER` target is an Ethereum address. The amount is Circle USDC. An allow broadcasts a Sepolia transfer from the executor key and stores the transaction hash. `SWAP` target is Sepolia WETH `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`. An allow swaps USDC to that WETH through Uniswap SwapRouter02. `0xvenue` is refused. A chain error is returned and the action is not marked executed. `API_CALL` and `CONTRACT_CALL` are policy decisions only.

`GET /x402/resource` is the demo seller. Without a `PAYMENT-SIGNATURE` header it returns 402 with the Sepolia USDC quote in the body and the `PAYMENT-REQUIRED` header. With one, it calls the facilitator at `FACILITATOR_URL` (default `http://localhost:$PORT/facilitator`) to verify and settle, then returns 200 with `PAYMENT-RESPONSE`. `0.01` is under the autonomous limit, so a clear payee is paid immediately. `EXECUTOR_PRIVATE_KEY` signs and must hold Circle USDC. The facilitator key (`FACILITATOR_PRIVATE_KEY`, else `EXECUTOR_PRIVATE_KEY`) pays Sepolia gas. The facilitator settles only to `X402_PAY_TO`.

```sh
curl -sS -D - "http://localhost:3001/x402/resource"
curl -sS "http://localhost:3001/facilitator/supported"
curl -sS "http://localhost:3001/x402/merchants"
curl -X POST "http://localhost:3001/agents/<agentId>/actions" \
  -H "content-type: application/json" \
  -d '{"action":"X402_PAYMENT","target":"http://localhost:3001/x402/resource","amount":"0.01"}'
```

Env, all optional:

```sh
API_URL=http://localhost:3001
AGENT_ID=<agent id>
AGENT_INTERVAL_MS=10000
AGENT_POLL_MS=2000
```

## MCP server

`apps/mcp` is a stdio MCP server for AI agents. It talks to the API at `API_URL` and pays as `AGENTLATCH_AGENT_ID`, else `AGENT_ID`, sending `AGENT_KEY` as `x-agent-key`. Every payment is an `X402_PAYMENT` action, so the ENS policy, Intercepta, and World approval apply. Listing agents needs an owner session, so the server does not look an agent up by name.

Tools: `list_merchants` (`GET /x402/merchants`), `quote_resource` (reads the 402 quote, pays nothing), `pay_resource` (`url`, `maxAmountUsdc`, `note`; refuses a price above the maximum), `get_payment`, `list_payments`, `request_swap`, `wait_for_approval` (polls for 45 seconds), `get_policy`, `recent_activity`.

```sh
bun apps/mcp/src/index.ts
claude mcp add dsap -e API_URL=http://localhost:3001 -- bun "$PWD/apps/mcp/src/index.ts"
```

Cursor or Claude Desktop:

```json
{
  "mcpServers": {
    "dsap": {
      "command": "bun",
      "args": ["/absolute/path/to/agent-latch/apps/mcp/src/index.ts"],
      "env": {
        "API_URL": "http://localhost:3001",
        "AGENT_ID": "<agent id>",
        "AGENT_KEY": "<agent key>"
      }
    }
  }
}
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

Live, that host is `https://dsap-protocol.onrender.com`. See [`deploy.md`](deploy.md).

A laptop API needs a tunnel only while Render is down:

```sh
ngrok http 3001
# put the https host in apps/web/vercel.json, then redeploy apps/web
```

Set the Developer Portal mini app URL to that web host. Set `WORLD_APP_ID`, `WORLD_NOTIFICATION_API_KEY`, and `SESSION_SECRET` in `.env` for the API. `WORLDCHAIN_RPC_URL` is optional. Generate the session secret once and keep it, or every API restart signs everyone out:

```sh
openssl rand -hex 32
```

World ID for Agents needs a confidential client from `https://sandbox.auth.world.org/portal`, registered with an HTTPS callback (device clients still need one) and `client_secret_basic`. Set these for the API only:

```sh
WORLD_OIDC_ISSUER=https://sandbox.auth.world.org
WORLD_CLIENT_ID=<portal client id>
WORLD_CLIENT_SECRET=<from the portal, backend only>
```

`GET /world/config` returns `worldIdReady: true` when all three are set.

On the phone: open the mini app in World App, tap Sign in with World App, sign, and allow notifications. The first sign-in creates the account. On the computer: open the dashboard, scan the QR code in World App, and tap Sign in. Each wallet sees only its own agents. When an agent goes past its rules, the push opens `/approve/<id>`. Deny: tap Deny and sign. Approve: tap Approve with World ID and sign, then tap Open World ID, check the code, and tap Authenticate with World ID. The action runs once the API has validated World's token. Tapping Deny sign-in on World ID rejects the approval. The desktop dashboard shows the same approval with a "Decide in World App" link.

## Checks

```sh
bun run typecheck
bun run lint
```
