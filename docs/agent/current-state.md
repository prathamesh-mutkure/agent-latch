# Current state

**Phase:** 0 complete. Next is Phase 1.
**Updated:** 2026-09-26

## What runs

- `apps/web` — React, Vite, Tailwind, TanStack Router, TanStack Query. One home page. No product data.
- `apps/api` — Elysia. `GET /health` only. Loads the repo-root `.env` when present.
- `apps/agent` — process starts and stays idle. It does not submit actions.
- `packages/core` — exports `packageId`. No domain types yet.

`bun run typecheck` and `bun run lint` are the checks. CI runs those two. There is no unit test suite.

## What is intentionally empty

`.gitkeep` only. Do not implement these early.

| Path | Phase |
| --- | --- |
| `packages/core/src/types`, `policy`, `authorization` | 1 |
| `db/schema`, `db/migrations`, `db/seed` | 2 |
| `packages/executors/api` | 3 |
| `packages/integrations/ens`, `contracts/` | 4 |
| `packages/integrations/world` | 5 |
| `packages/integrations/intercepta`, `packages/integrations/x402`, `packages/executors/x402` | 6 |
| `packages/api-client` | 7 |
| `apps/world-miniapp` | 8 |
| `packages/executors/uniswap` | 9 |
| `packages/sdk`, `packages/contracts` | later |

Postgres is not running. No Docker, no contracts, no sponsor SDKs.

## Phase 1 next

In-memory control plane. No sponsors.

- Add `ActionRequest`, `Policy`, `PolicyDecision`, and `ApprovalRequest` in `@agentlatch/core`.
- Pure policy evaluation for the three demo cases: within limit allows, above autonomous limit asks for approval, above the hard limit blocks.
- API: create an agent, set a policy, submit an action, approve or reject.
- In-memory store. Amounts are USDC, displayed as dollars.
- Leave the background agent idle until Phase 3. No login and no signer in this phase.
