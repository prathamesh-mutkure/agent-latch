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
| 4 | ENSv2 | done | partial | Parent read passed. Subname write is not testable yet |
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
| `POST /agents/:id/ens` creates `trader.prathamesh-reap.eth` | blocked | Parent subregistry is `0x0000…0000`. The route only calls `register` on `ENS_REGISTRY_ADDRESS`. It does not deploy a UserRegistry or call `setSubregistry`. Do not send that transaction against the ETHRegistry |

## Notes

- Amounts are USDC strings. One chain: Ethereum Sepolia.
- Demo policy: autonomous 500, hard limit 5000. No daily cap on the background agent.
- `ens.name` is set when ENSjs returns an owner or the registry status is `REGISTERED`.
- Sepolia address for the parent name: `0x6B9cE6a3463deF6A2B61f0DB5eC9C460174958A6`.
- `POST /agents/:id/ens` needs `EXECUTOR_PRIVATE_KEY` and `ROLE_REGISTRAR` on `ENS_REGISTRY_ADDRESS`. The public ETHRegistry will reject the demo key.
- Simulated execution never signs. Policy stays free of sponsors.
