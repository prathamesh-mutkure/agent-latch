# Current state

**Updated:** 2026-09-27

Rewrite the row you changed. Do not append a diary. Commands live in `commands.md`.

## In progress

- World App notifications, phase 8. Wallet link and pushes are in. A phone needs `WORLD_APP_ID`, `WORLD_NOTIFICATION_API_KEY`, and a public HTTPS host whose `/auth/world/callback` is `WORLD_REDIRECT_URI`. The live World ID sandbox round trip is still unrun.

## Todos

| Phase | Task | State | Testing | Notes |
| --- | --- | --- | --- | --- |
| 0 | Monorepo scaffold | done | passed | Typecheck, lint, apps boot |
| 1 | In-memory control plane | done | passed | Replaced by phase 2 storage |
| 2 | Postgres + Drizzle | done | passed | Migrations apply on API startup |
| 3 | Background agent | done | passed | 100 allow, 2500 waits, 10000 block |
| 4 | ENSv2 | done | passed | `trader.agent-latch.eth` registered |
| 7 | Dashboard | done | passed | `apps/web`. Eden client in `packages/api-client` |
| 5 | World ID for Agents | in progress | partial | `@agentlatch/world`, `modules/auth`, owner claim, `/approve/:id`. Approve and deny only via World step-up. The API starts the step-up and waits for the human to confirm on World's page. OIDC env is set. Full callback still needs the redirect registered with World |
| 6 | Intercepta + x402 | done | passed | Quick scan and a signed Sepolia USDC settlement |
| later | ENS gate and resolver | done | passed | Missing or expired name blocks the action. `trader.agent-latch.eth` resolver `0xe71b020df50c07DAcE858f47BaC4341f82c82001`, ETH address `0x142B99367b928608835501633534411EFc467737`. Text records: autonomous 500, hard 5000, daily none. Engine still reads Postgres |
| last | Publish a looser ENS policy | todo | not started | Tighter edits write the name now. Raising a limit or adding a permission waits on the World check. A policy content hash is post-hackathon |
| 8 | World mini app | in progress | partial | `/mini` on `apps/web`. Portal app `app_e84b1b772fa55ee5b4e8a367f169c345` is a mini app at `https://www.dsapprotocol.xyz`, developer-listed, notifications uncapped. No logo yet, so it is not submitted for review. `apps/world-miniapp` stays empty. Live phone push not run |
| 9 | Uniswap | todo | not started | Optional, last |
| 10 | Hackathon polish | todo | not started | |

Empty on purpose: `db/seed`, `packages/executors/api`, `apps/world-miniapp`, `packages/executors/uniswap`, `packages/signers/alchemy`, `packages/sdk`, `packages/contracts`, `contracts/`.

## Testing

No unit test suite. Checks are `bun run typecheck` and `bun run lint`.

| Check | State | Result |
| --- | --- | --- |
| Allow 100, approval 2500, block 10000 | done | API decisions match the demo policy |
| Approve once, second decision 409, reject does not execute | done | |
| Migrations apply on API startup | done | Log line `migrations applied` |
| ENSjs + registry read of `prathamesh-reap.eth` | done | `REGISTERED`, owner and ETH address `0x6B9cE6a3463deF6A2B61f0DB5eC9C460174958A6`, expiry 2027-09-26. Roles granted: set subregistry, set resolver, transfer admin |
| `GET /agents/:id` returns that `ens` object | todo | Hit it once the API process can reach Sepolia |
| `POST /agents/:id/ens` creates `trader.agent-latch.eth` | done | `REGISTERED`, owner `0x142B99367b928608835501633534411EFc467737`, registry `0xE48a112cCd94F06D316c32E911D752478d4E1236`. Resolver `0xe71b020df50c07DAcE858f47BaC4341f82c82001`. ETH address `0x142B99367b928608835501633534411EFc467737` |
| Dashboard pages and reject | done | Overview, agent, policies, activity, approvals, and payments render against the live API. Reject on the pending 2500 USDC swap returned `REJECTED` and the audit line showed up. Approve uses the same control. A later 2500 approval was left pending |
| Intercepta quick scan on `X402_PAYMENT` | done | $1 to `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` allowed, toxic score 0, simulated execution. $1 to `0x098B716B8Aaf21512996dC57EB0615e2383E2f96` blocked, toxic score 100, no execution. A payee the API does not know returns 404 and the payment is refused |
| World step-up checks against Postgres | done | Scratch script with a stand-in World identity: second sign-in reuses the `users` row; claim, and a second owner gets 409; approve → `APPROVED`; replay → not pending; other `sub` → `FAILED: WRONG_HUMAN`; old `auth_time` → `FAILED: STALE_VERIFICATION`; amount edited in SQL → `FAILED: BINDING`; stranger step-up 403; cancel → `CANCELLED`; past expiry → `EXPIRED`. Deny with World → `REJECTED`; a deny proof used to approve, or the reverse → `FAILED: BINDING`; deny by another `sub` → `FAILED: WRONG_HUMAN`; backing out of deny keeps `PENDING`. Rows removed afterwards |
| World routes without a client | done | `/auth/world/login` 503, `/me` 401, `POST /approvals/:id/approve` and `/deny` 404. Same through the Vite proxy on 5173. Authorize URL built from live sandbox discovery carries `max_age=0`, `prompt=login`, orb-v3 `acr_values`, S256 PKCE |
| World sign-in and step-up with the sandbox | partial | `beginStepUp` left the sandbox transaction `verified`. A browser without the initiator cookie saw `initiator: false`, and its approve call is what moved the transaction to `approved`. The API does not redeem before that. Full callback still needs the redirect registered with World |
| World App wallet link and push | partial | Portal mini app URL is `https://www.dsapprotocol.xyz`. `WORLD_APP_ID` matches that app and the notification key is set. Live phone push not run |
| x402 USDC settlement on Sepolia | done | `GET /x402/resource` is 402. `0.01` USDC to `0x142B99367b928608835501633534411EFc467737` allowed, Intercepta score 0, signed execution, tx `0x22d690597c411be1aebb8c98e508852ae407dfb7df5d8c4bec2772315d956f22`. The same URL with `?tx=` returns 200 |

## Notes

- Amounts are USDC strings. One chain: Ethereum Sepolia.
- Demo policy: autonomous 500, hard limit 5000. No daily cap on the background agent.
- `ens.name` is set when ENSjs returns an owner or the registry status is `REGISTERED`.
- Sepolia demo signer: `0x142B99367b928608835501633534411EFc467737`. Parent name: `agent-latch.eth`.
- `POST /agents/:id/ens` deploys a UserRegistry under `ENS_PARENT_NAME` when needed, then registers the agent label, points it at the signer's Permissioned Resolver, writes the signer's ETH address, and copies the current Postgres policy onto the name when that copy is not looser than the published one. The signer must be the parent owner and hold Sepolia ETH. An action is blocked when that name is missing, expired, or has no published policy. The spending decision reads the name.
- Swaps stay unsigned. An x402 settlement signs and broadcasts. Policy stays free of sponsors.
- The dashboard polls the API through the Vite proxy (`/api`, prefix stripped; `/auth` as is). Approve opens `/auth/world/step-up?approval=:id`, which returns to `/approve/:id?handoff=1`. Deny is the same redirect with `&decision=deny`. Approve opens the World ID window from that click, and the page applies the decision only after World reports it approved. Approvals expire after 5 minutes. The ENS pill stays `REGISTERED` when the name is registered. World ID ownership is separate: an unclaimed agent shows a claim link on Agents and on the agent page.
- `/mini` links a World App wallet with SIWE and lists the signed-in owner's pending approvals. Pushes use `WORLD_APP_ID` and `WORLD_NOTIFICATION_API_KEY`. A missing key or wallet skips the push. Approve and deny stay on the step-up.
- The payments page lists `X402_PAYMENT` actions. Each one is quick-scanned before execution. A clear scan settles Circle USDC with EIP-3009. The signer pays Sepolia gas. A missing key, a 404 from the scan, or a failed settlement refuses the payment. Live traits may omit `txsCount`.
