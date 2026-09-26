# Deploy the API and Postgres

Live:

- Web: `https://www.dsapprotocol.xyz` on Vercel. `apps/web/vercel.json` rewrites `/api` to `https://dsap-protocol.onrender.com/$1`. World App never calls the API. The phone opens the web app, and the web app calls `/api`.
- API: `https://dsap-protocol.onrender.com`, one Bun process on Render Free. A ping every 5 minutes keeps it awake. On startup it applies `db/migrations` and logs `migrations applied`.
- Postgres: Neon. The API reads the direct `DATABASE_URL` (no `-pooler`). Local Docker (`postgres:16`, database `agentlatch`, port 5432, `bun run infra:up`) is the laptop database.
- `apps/agent` and `apps/mcp` stay on the demo machine. The MCP server is stdio for Claude or Cursor. Do not deploy it.

The web app stays on Vercel. Vercel runs Elysia as a function: Hobby invocations stop at 300 seconds, and a new invocation does not keep the previous process. Sign-in nonces, QR pairing codes, and the World ID poller live in the API process. Render runs `bun src/index.ts`, which is what `apps/api` already does. There is no Docker image.

## Hosts

- **Postgres:** [Neon](https://neon.tech). The live project is already created. A new one should be Postgres **16** (the console defaults to a newer major; the live project is 18 and the copied schema loaded). Free scale-to-zero cannot be turned off: the compute suspends after 5 minutes with no queries. The dashboard polls during a demo, so it stays awake while people are using it.
- **API:** [Render](https://render.com), Node runtime (Bun is on that runtime). One web service, one instance. Free sleeps after 15 minutes with no requests; this service is kept awake with a ping every 5 minutes.

## Postgres

1. In the Neon console, create a project. Prefer Postgres version **16**. Leave the database name Neon assigns.
2. Neon shows two strings. `DATABASE_URL` is direct. `DATABASE_URL_POOLED` has `-pooler` in the host. On Render, set `DATABASE_URL` to the direct string. Do not set `DATABASE_URL_POOLED`. The API reads only `DATABASE_URL`, and startup runs Drizzle migrations on that same URL.
3. Keep `sslmode=require`. If the string also has `channel_binding`, delete that parameter. `postgres` forwards unknown URL parameters as server startup options, and `channel_binding` is a client setting.

## Postgres

1. In the Neon console, create a project. Postgres version **16**. Leave the database name Neon assigns (often `neondb`). The API migrates whichever database `DATABASE_URL` names.
2. Neon shows two strings. `DATABASE_URL` is direct. `DATABASE_URL_POOLED` has `-pooler` in the host. On Render, set `DATABASE_URL` to the direct string. Do not set `DATABASE_URL_POOLED`. The API reads only `DATABASE_URL`, and startup runs Drizzle migrations on that same URL. The pooler is the wrong endpoint for that.
3. Keep `sslmode=require`. If the string also has `channel_binding`, delete that parameter. `postgres` forwards unknown URL parameters as server startup options, and `channel_binding` is a client setting.

`DATABASE_URL` looks like:

```text
postgresql://USER:PASSWORD@ep-example.region.aws.neon.tech/neondb?sslmode=require
```

The local value `postgres://postgres:postgres@localhost:5432/agentlatch` is the Docker database. Leave it on the laptop. This guide does not copy those rows. The hosted database starts empty, and the API creates the tables on startup.

`bun run infra:up` and `bun run infra:reset` only touch the local Docker volume. `infra:reset` deletes that volume. Do not run it against a database you mean to keep.

## API

The live service is `https://dsap-protocol.onrender.com`. To recreate it, one Render web service from this repo:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Root directory | repository root (empty) |
| Build command | `bun install` |
| Start command | `bun --filter @agentlatch/api start` |
| Health check path | `/health` |
| Instances | 1 |

`bun --filter @agentlatch/api start` runs `bun src/index.ts`. The root directory has to be the repo root so the workspace packages install. Render sets `PORT`; leave it unset. Also set `BUN_VERSION=1.3.8`. The process applies `db/migrations`, logs `migrations applied`, then listens.

The API loads a repo-root `.env` when that file is on disk, and it does not override variables already set. On Render, set the variables in the service. Do not commit `.env`. Do not set `PORT` or `FACILITATOR_URL`.

## Environment

Every name below is in `.env.example`. Secrets stay off the web app and off every `VITE_` variable. Copy them from the local `.env` into the Render service. `SESSION_SECRET` must stay the same across restarts and deploys. If it changes, or if it is unset, every restart signs everyone out. Generate it once:

```sh
openssl rand -hex 32
```

### Required on the API

| Variable | Why |
| --- | --- |
| `DATABASE_URL` | Hosted Postgres. The API migrates on startup. |
| `SESSION_SECRET` | Signs owner sessions. Stable across restarts. |
| `EXECUTOR_PRIVATE_KEY` | Sepolia key for ENS registration, USDC transfers, swaps, and x402. The process still listens without it; those actions fail. |
| `WORLD_APP_ID` | Mini app `app_e84b1b772fa55ee5b4e8a367f169c345`. Sign-in and pushes read it. |
| `WORLD_NOTIFICATION_API_KEY` | Push when an approval opens. A missing key skips the push. |
| `WORLD_OIDC_ISSUER` | `https://sandbox.auth.world.org` |
| `WORLD_CLIENT_ID` | Sandbox confidential client. |
| `WORLD_CLIENT_SECRET` | Same client, `client_secret_basic`. Approve returns 503 without the three World ID values. |
| `INTERCEPTA_API_KEY` | Quick scan before `X402_PAYMENT`. A missing key refuses the payment. |

### Optional on the API

| Variable | If unset |
| --- | --- |
| `PORT` | Render sets it. Leave it unset. The code defaults to `3001` only when it is missing, which is the local port. |
| `ENS_PARENT_NAME` | `agent-latch.eth` |
| `SEPOLIA_RPC_URL` | Public node, which rate-limits ENS reads (`Request exceeds defined limit.`). Set a keyed Sepolia URL. |
| `ENS_REGISTRY_ADDRESS` | Sepolia ETHRegistry. |
| `WORLDCHAIN_RPC_URL` | Public World Chain endpoint, used for Safe EIP-1271 checks. |
| `X402_PAY_TO` | Demo signer `0x142B99367b928608835501633534411EFc467737`. Leave unset for that demo. The facilitator settles only to this address. |
| `FACILITATOR_PRIVATE_KEY` | Falls back to `EXECUTOR_PRIVATE_KEY`. Pays Sepolia gas for the demo seller. |
| `FACILITATOR_URL` | Leave unset. The seller calls `http://127.0.0.1:$PORT/facilitator` on the same process. A copied `localhost:3001` value is ignored when `PORT` is different. |

The API does not read `USDC_ADDRESS`, `X402_NETWORK`, `DATABASE_URL_POOLED`, `WORLD_REDIRECT_URI`, or `COOKIE_SECRET`. Circle USDC and `eip155:11155111` are constants in code.

These are not API variables. They do not go on the web app.

| Variable | Process |
| --- | --- |
| `API_URL` | Background agent and the MCP server. |
| `AGENT_ID`, `AGENT_KEY` | Background agent, sent as `x-agent-key`. The key is shown once. |
| `AGENT_INTERVAL_MS`, `AGENT_POLL_MS` | Background agent. Defaults `10000` and `2000`. |
| `AGENTLATCH_AGENT_ID` | MCP server, else `AGENT_ID`. |
| `AGENT_PRIVATE_KEY` | MCP server, on the demo machine. Signs action requests. |
| `AGENTLATCH_AGENT_ENS` | MCP server, the agent's ENS name from the dashboard. |

`SESSION_SECRET`, `EXECUTOR_PRIVATE_KEY`, `FACILITATOR_PRIVATE_KEY`, `WORLD_NOTIFICATION_API_KEY`, `WORLD_CLIENT_SECRET`, `INTERCEPTA_API_KEY`, `AGENT_KEY`, and `AGENT_PRIVATE_KEY` never go in the web app or a `VITE_` variable.

## One instance

Run a single API process. Sign-in nonces and QR pairing codes live in process memory. A second instance, or a restart, drops a sign-in in progress. The owner taps Sign in again, and the computer shows a new QR code. World ID checks that were already waiting are resumed from Postgres. Sessions survive a restart only while `SESSION_SECRET` is unchanged. Sessions last 24 hours.

## Background agent

Run it on the demo machine. It only calls the API. It does not need `DATABASE_URL` or the World secrets. The demo does not need `AGENT_KEY`; the agent idles without it.

```sh
API_URL=https://dsap-protocol.onrender.com bun --filter @agentlatch/agent start
```

Set `AGENT_ID` and `AGENT_KEY` in the environment first if it should act. The key is shown once on the agent's page. `AGENT_INTERVAL_MS` and `AGENT_POLL_MS` are optional (defaults `10000` and `2000`).

The unverified mini app allows 40 pushes per 4 hours. Raise `AGENT_INTERVAL_MS` for a long session.

## MCP server

Leave `apps/mcp` on the demo machine. It is stdio. Do not deploy it as a public HTTP service.

Point `API_URL` at the deployed API. Keep `AGENT_ID`, `AGENT_KEY`, `AGENT_PRIVATE_KEY`, and `AGENTLATCH_AGENT_ENS` in that local MCP config (Cursor or Claude), not in Vercel and not in the web build.

```json
{
  "mcpServers": {
    "dsap": {
      "command": "bun",
      "args": ["/absolute/path/to/agent-latch/apps/mcp/src/index.ts"],
      "env": {
        "API_URL": "https://dsap-protocol.onrender.com",
        "AGENT_ID": "<agent id>",
        "AGENT_KEY": "<agent key>",
        "AGENT_PRIVATE_KEY": "<agent signing key>",
        "AGENTLATCH_AGENT_ENS": "<name>.<username>.agent-latch.eth"
      }
    }
  }
}
```

## Point the web app at the API

The live rewrite is already set. To point a new API host at the site, change `apps/web/vercel.json` and redeploy `apps/web`. Leave the SPA rewrite as it is.

```json
{
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "https://dsap-protocol.onrender.com/$1"
    },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

`$1` is the path after `/api`, so `https://www.dsapprotocol.xyz/api/health` hits `https://dsap-protocol.onrender.com/health`.

The Developer Portal mini app URL is already `https://www.dsapprotocol.xyz`. Change it only if the web host changes.

## Smoke check

```sh
curl -sS "https://dsap-protocol.onrender.com/health"
curl -sS "https://dsap-protocol.onrender.com/world/config"
curl -sS "https://www.dsapprotocol.xyz/api/health"
curl -sS "https://www.dsapprotocol.xyz/api/world/config"
```

`/health` returns `"database": "up"`. `/world/config` returns `"worldIdReady": true`.

Sign in on `https://www.dsapprotocol.xyz`. The session is in local storage under `dsap.session` (field `token`). Then:

```sh
curl -sS "https://www.dsapprotocol.xyz/api/agents" \
  -H "authorization: Bearer <token>"
```

That list is the signed-in owner's agents, loaded through the Vercel `/api` rewrite. Opening `/agents` on the site should show the same list.

## Do not

- Do not commit `.env` or `.cursor/mcp.json`.
- Do not run `infra:reset` on a database you mean to keep. It deletes the local Docker volume.
- Do not put `WORLD_NOTIFICATION_API_KEY` or `WORLD_CLIENT_SECRET` in the web app or any `VITE_` variable.
- Do not rotate World ID keys, and do not run `configure_world_id`. Both have on-chain side effects.
- Do not run a second API instance.
- Do not deploy `apps/mcp` as a public HTTP service.
