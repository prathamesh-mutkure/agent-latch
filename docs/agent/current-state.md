# Current state

**Updated:** 2026-09-26

Rewrite the row you changed. Do not append a diary. Commands live in `commands.md`.

## In progress

Dashboard, phase 7, in `apps/web`. Leave approve and reject response shapes stable.

## Todos

| Phase | Task | State | Testing | Notes |
| --- | --- | --- | --- | --- |
| 0 | Monorepo scaffold | done | passed | Typecheck, lint, apps boot |
| 1 | In-memory control plane | done | passed | Replaced by phase 2 storage |
| 2 | Postgres + Drizzle | done | passed | Migrations apply on API startup |
| 3 | Background agent | done | passed | 100 allow, 2500 waits, 10000 block |
| 4 | ENSv2 | done | passed | `trader.agent-latch.eth` registered |
| 7 | Dashboard | in progress | not started | `apps/web`. Other person |
| 5 | World ID for Agents | todo | not started | After approve and reject buttons exist |
| 6 | Intercepta + x402 | todo | not started | After World |
| 8 | World mini app | todo | not started | After phase 5 |
| 9 | Uniswap | todo | not started | Optional, last |
| 10 | Hackathon polish | todo | not started | |

Empty on purpose: `db/seed`, `packages/executors/api`, `packages/integrations/world`, `packages/integrations/intercepta`, `packages/integrations/x402`, `packages/executors/x402`, `packages/api-client`, `apps/world-miniapp`, `packages/executors/uniswap`, `packages/signers/local`, `packages/signers/alchemy`, `packages/sdk`, `packages/contracts`, `contracts/`.

## Testing

No unit test suite. Checks are `bun run typecheck` and `bun run lint`.

| Check | State | Result |
| --- | --- | --- |
| Allow 100, approval 2500, block 10000 | done | API decisions match the demo policy |
| Approve once, second decision 409, reject does not execute | done | |
| Migrations apply on API startup | done | Log line `migrations applied` |
| ENSjs + registry read of `prathamesh-reap.eth` | done | `REGISTERED`, owner and ETH address `0x6B9cE6a3463deF6A2B61f0DB5eC9C460174958A6`, expiry 2027-09-26. Roles granted: set subregistry, set resolver, transfer admin |
| `GET /agents/:id` returns that `ens` object | todo | Hit it once the API process can reach Sepolia |
| `POST /agents/:id/ens` creates `trader.agent-latch.eth` | done | `REGISTERED`, owner `0x142B99367b928608835501633534411EFc467737`, registry `0xE48a112cCd94F06D316c32E911D752478d4E1236`. ETH address record is null because no resolver was set |

## Notes

- Amounts are USDC strings. One chain: Ethereum Sepolia.
- Demo policy: autonomous 500, hard limit 5000. No daily cap on the background agent.
- `ens.name` is set when ENSjs returns an owner or the registry status is `REGISTERED`.
- Sepolia demo signer: `0x142B99367b928608835501633534411EFc467737`. Parent name: `agent-latch.eth`.
- `POST /agents/:id/ens` deploys a UserRegistry under `ENS_PARENT_NAME` when needed, then registers the agent label. The signer must be the parent owner and hold Sepolia ETH.
- Simulated execution never signs. Policy stays free of sponsors.
