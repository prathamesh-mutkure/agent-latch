# Current state

**Updated:** 2026-09-26

Rewrite the row you changed. Do not append a diary. Commands live in `commands.md`.

## In progress

- World ID, phase 5, in `packages/integrations/world`. Ankit. The approval shape is open in `open-questions.md`. Read `planning-v2.md` and `continuation.md`. Leave that package alone.

## Todos

| Phase | Task | State | Testing | Notes |
| --- | --- | --- | --- | --- |
| 0 | Monorepo scaffold | done | passed | Typecheck, lint, apps boot |
| 1 | In-memory control plane | done | passed | Replaced by phase 2 storage |
| 2 | Postgres + Drizzle | done | passed | Migrations apply on API startup |
| 3 | Background agent | done | passed | 100 allow, 2500 waits, 10000 block |
| 4 | ENSv2 | done | passed | `trader.agent-latch.eth` registered |
| 7 | Dashboard | done | passed | `apps/web`. Eden client in `packages/api-client` |
| 5 | World ID for Agents | in progress | not started | Ankit. `packages/integrations/world`. Shape is open in `open-questions.md` |
| 6 | Intercepta + x402 | done | passed | Quick scan and a signed Sepolia USDC settlement |
| later | ENS gate and resolver | todo | not started | After the Postgres policy path is finished. Refuse a missing or expired name. Set resolver and `addr`. Policy stays in Postgres |
| last | Policy on ENS | todo | not started | Publish rules onto ENS. A looser edit needs a fresh approval. Tighter edits write immediately |
| 8 | World mini app | todo | not started | After phase 5 |
| 9 | Uniswap | todo | not started | Optional, last |
| 10 | Hackathon polish | todo | not started | |

Empty on purpose: `db/seed`, `packages/executors/api`, `packages/integrations/world`, `apps/world-miniapp`, `packages/executors/uniswap`, `packages/signers/alchemy`, `packages/sdk`, `packages/contracts`, `contracts/`.

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
| Dashboard pages and reject | done | Overview, agent, policies, activity, approvals, and payments render against the live API. Reject on the pending 2500 USDC swap returned `REJECTED` and the audit line showed up. Approve uses the same control. A later 2500 approval was left pending |
| Intercepta quick scan on `X402_PAYMENT` | done | $1 to `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` allowed, toxic score 0, simulated execution. $1 to `0x098B716B8Aaf21512996dC57EB0615e2383E2f96` blocked, toxic score 100, no execution. A payee the API does not know returns 404 and the payment is refused |
| x402 USDC settlement on Sepolia | done | `GET /x402/resource` is 402. `0.01` USDC to `0x142B99367b928608835501633534411EFc467737` allowed, Intercepta score 0, signed execution, tx `0x22d690597c411be1aebb8c98e508852ae407dfb7df5d8c4bec2772315d956f22`. The same URL with `?tx=` returns 200 |

## Notes

- Amounts are USDC strings. One chain: Ethereum Sepolia.
- Demo policy: autonomous 500, hard limit 5000. No daily cap on the background agent.
- `ens.name` is set when ENSjs returns an owner or the registry status is `REGISTERED`.
- Sepolia demo signer: `0x142B99367b928608835501633534411EFc467737`. Parent name: `agent-latch.eth`.
- `POST /agents/:id/ens` deploys a UserRegistry under `ENS_PARENT_NAME` when needed, then registers the agent label. The signer must be the parent owner and hold Sepolia ETH.
- Swaps stay unsigned. An x402 settlement signs and broadcasts. Policy stays free of sponsors.
- The dashboard polls the API. The API allows the dashboard origin. Approve and reject response bodies are unchanged.
- The payments page lists `X402_PAYMENT` actions. Each one is quick-scanned before execution. A clear scan settles Circle USDC with EIP-3009. The signer pays Sepolia gas. A missing key, a 404 from the scan, or a failed settlement refuses the payment. Live traits may omit `txsCount`.
