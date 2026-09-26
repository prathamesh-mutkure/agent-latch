# Deploy the API and Postgres

Nothing here has been run. Postgres is still local Docker, and the live site still reaches a laptop through ngrok.

Today:

- Postgres is `docker compose`, image `postgres:16`, database `agentlatch`, user and password `postgres`, port 5432. `bun run infra:up` starts it. There is no hosted database.
- The API is `apps/api`, Elysia on Bun, port 3001 locally. On startup it applies `db/migrations` and logs `migrations applied`.
- The web app is already on Vercel at `https://www.dsapprotocol.xyz`. `apps/web/vercel.json` rewrites `/api` to an ngrok host. World App never calls the API. The phone opens the web app, and the web app calls `/api`.
- `apps/agent` and `apps/mcp` are separate processes. The MCP server is stdio for Claude or Cursor.

This replaces the tunnel with a hosted Postgres 16 and one public HTTPS API process. Bun runs the API directly. There is no Docker image.

## Hosts

A few hours, on free tiers:

- **Postgres:** [Neon](https://neon.tech) Free. Create a project and set the Postgres version to **16** (the console defaults to a newer major). The local image is `postgres:16`. Free includes 100 compute-hours a month. Scale-to-zero is on and cannot be turned off: the compute suspends after 5 minutes with no queries. The dashboard polls during a demo, so it stays awake while people are using it. The next request after a quiet gap wakes it; `/health` can say `database: "down"` until that wake finishes. Request it again.
- **API:** [Railway](https://railway.com) Free. One service, one replica (the plan maximum). Bun runs through Railpack from `packageManager` in the root `package.json`. Leave **Serverless off**. With it on, the process sleeps after 10 minutes without outbound traffic, and that drops a sign-in in progress. Free includes $1 of usage credit a month. A small API for a few hours is a few cents. Stop the service when the demo is over, or a process left on all month uses up the credit and Railway pauses it. A new account also gets a 30-day trial with $5 of credit.

The web app stays on Vercel. Do not move the API there. Vercel runs Elysia as a function: Hobby invocations stop at 300 seconds, and a new invocation does not keep the previous process. Sign-in nonces, QR pairing codes, and the World ID poller live in that process. Railway runs `bun src/index.ts` as one server, which is what `apps/api` already does.

The MCP server stays on the demo machine. It is stdio for Claude or Cursor. Railway and Vercel do not host it.

Put the Neon project and the Railway service in the same region when both consoles offer it.

## Postgres

1. In the Neon console, create a project. Postgres version **16**. Leave the database name Neon assigns (often `neondb`). The API migrates whichever database `DATABASE_URL` names.
2. Neon shows two strings. `DATABASE_URL` is direct. `DATABASE_URL_POOLED` has `-pooler` in the host. On Railway, set `DATABASE_URL` to the direct string. Do not set `DATABASE_URL_POOLED`. The API reads only `DATABASE_URL`, and startup runs Drizzle migrations on that same URL. The pooler is the wrong endpoint for that.
3. Keep `sslmode=require`. If the string also has `channel_binding`, delete that parameter. `postgres` forwards unknown URL parameters as server startup options, and `channel_binding` is a client setting.

`DATABASE_URL` looks like:

```text
postgresql://USER:PASSWORD@ep-example.region.aws.neon.tech/neondb?sslmode=require
```

The local value `postgres://postgres:postgres@localhost:5432/agentlatch` is the Docker database. Leave it on the laptop. This guide does not copy those rows. The hosted database starts empty, and the API creates the tables on startup.

`bun run infra:up` and `bun run infra:reset` only touch the local Docker volume. `infra:reset` deletes that volume. Do not run it against a database you mean to keep.

## API

One Railway service from this repo. Generate a public domain. The URL looks like `https://<service>.up.railway.app`.

| Setting | Value |
| --- | --- |
| Builder | Railpack |
| Root directory | repository root |
| Build command | `bun install` |
| Start command | `bun --filter @agentlatch/api start` |
| Replicas | 1 |
| Serverless | off |

`bun --filter @agentlatch/api start` runs `bun src/index.ts`. The root directory has to be the repo root so the workspace packages install. Railway sets `PORT`; leave it unset. The process applies `db/migrations`, logs `migrations applied`, then listens.

The API loads a repo-root `.env` when that file is on disk, and it does not override variables already set. On Railway, set the variables in the service. Do not commit `.env`.

## Environment

Every name below is in `.env.example`. Secrets stay off the web app and off every `VITE_` variable. Copy them from the local `.env` into the Railway service. `SESSION_SECRET` must stay the same across restarts and deploys. If it changes, or if it is unset, every restart signs everyone out. Generate it once:

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
| `PORT` | Railway sets it. The code defaults to `3001` only when it is missing, which is the local port. |
| `ENS_PARENT_NAME` | `agent-latch.eth` |
| `SEPOLIA_RPC_URL` | Public node, which rate-limits ENS reads (`Request exceeds defined limit.`). Set a keyed Sepolia URL. |
| `ENS_REGISTRY_ADDRESS` | Sepolia ETHRegistry. |
| `WORLDCHAIN_RPC_URL` | Public World Chain endpoint, used for Safe EIP-1271 checks. |
| `X402_PAY_TO` | Demo signer `0x142B99367b928608835501633534411EFc467737`. Leave unset for that demo. The facilitator settles only to this address. |
| `FACILITATOR_PRIVATE_KEY` | Falls back to `EXECUTOR_PRIVATE_KEY`. Pays Sepolia gas for the demo seller. |
| `FACILITATOR_URL` | Leave unset. The seller calls `http://localhost:$PORT/facilitator` on the same Railway process. Railway sets `PORT`. |

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

Run it on the demo machine so the Railway credit stays on the API. It only calls the API. It does not need `DATABASE_URL` or the World secrets.

```sh
API_URL=https://<service>.up.railway.app bun --filter @agentlatch/agent start
```

Set `AGENT_ID` and `AGENT_KEY` in the environment first. The key is shown once on the agent's page. Without them the process logs that it is idle and exits. `AGENT_INTERVAL_MS` and `AGENT_POLL_MS` are optional (defaults `10000` and `2000`).

A second Railway service with the same start command also works, and it spends the same $1 credit. One service is enough for a few hours.

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
        "API_URL": "https://<service>.up.railway.app",
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

After `GET /health` on the Railway URL returns `database: "up"`, change the `/api` rewrite in `apps/web/vercel.json` and redeploy `apps/web`. Leave the SPA rewrite as it is.

```json
{
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "https://<service>.up.railway.app/$1"
    },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

`$1` is the path after `/api`, so `https://www.dsapprotocol.xyz/api/health` hits `https://<service>.up.railway.app/health`.

The Developer Portal mini app URL is already `https://www.dsapprotocol.xyz`. Change it only if the web host changes.

## Smoke check

```sh
curl -sS "https://<service>.up.railway.app/health"
curl -sS "https://<service>.up.railway.app/world/config"
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
