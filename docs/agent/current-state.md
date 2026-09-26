# Current state

**Phase:** 2 complete. Next is Phase 3.
**Updated:** 2026-09-26

## What runs

- `packages/core` — `ActionRequest`, `Policy`, `PolicyDecision`, `ApprovalRequest`. `evaluatePolicy` is pure and does not create approval ids. Amounts are USDC base units.
- `apps/api` — Postgres control plane via Drizzle, split into `modules/{agents,actions,approvals,audit,health}`. Zod validates requests. `to*Dto` shapes responses. Data survives an API restart.
- Allowed actions execute through a simulated executor. `signed` is always false. No key is read. The future signer is a separate module from executors. See `packages/signers/`.
- `apps/web` — home page only. It does not call the API yet.
- `apps/agent` — still idle. It does not submit actions until Phase 3.

`bun run typecheck` and `bun run lint` are the checks. CI runs those two. There is no unit test suite.

Demo policy: autonomous 500 USDC, hard limit 5000 USDC. 100 allows, 600 waits for approval, 10000 blocks. An amount equal to the hard limit still needs approval. Amounts above it block. Approving executes that one action. Rejecting does not. A second decision on the same approval returns 409.

## What is intentionally empty

`.gitkeep` only. Do not implement these early.

| Path | Phase |
| --- | --- |
| `db/seed` | optional local seed, unused |
| `packages/executors/api` | 3 |
| `packages/integrations/ens`, `contracts/` | 4 |
| `packages/integrations/world` | 5 |
| `packages/integrations/intercepta`, `packages/integrations/x402`, `packages/executors/x402` | 6 |
| `packages/api-client` | 7 |
| `apps/world-miniapp` | 8 |
| `packages/executors/uniswap` | 9 |
| `packages/signers/local` | when the first real signature is required |
| `packages/signers/alchemy` | later extension, not the default |
| `packages/sdk`, `packages/contracts` | later |

Local Postgres is `bun run infra:up`, then `bun run db:migrate`. `infra:down` stops it. `infra:reset` drops the volume and migrates again. No contracts and no sponsor SDKs. `GET /agents/:agentId/audit` is the timeline. `GET /health` reports whether the database is up.

## API

Amounts are USDC strings (`"100"`, `"1.5"`). The token is Sepolia USDC unless an action names another token, which is blocked.

- `POST /agents` `{ name }`
- `PUT /agents/:agentId/policy` `{ autonomousLimit, hardLimit, dailyLimit?, allowedActions?, allowedTargets? }`
- `POST /agents/:agentId/actions` `{ action, target, amount, token?, note? }`
- `POST /approvals/:approvalId/approve`
- `POST /approvals/:approvalId/reject`

List routes: `GET /agents`, `GET /agents/:agentId`, `GET /agents/:agentId/policy`, `GET /agents/:agentId/actions`, `GET /agents/:agentId/audit`, `GET /actions/:actionId`, `GET /approvals`, `GET /approvals/:approvalId`.

Daily limit is optional and must be at least the autonomous limit. Pending approvals expire after 15 minutes. No login.

## Phase 3 next

Background agent. It should notice a mocked condition, submit an `ActionRequest`, and keep running when the dashboard is closed. Leave the signer and sponsor integrations alone.
