# Current state

**Updated:** 2026-09-27

Rewrite the row you changed. Do not append a diary. Commands live in `commands.md`.

## In progress

- World approval on a phone. Read [`issues.md`](issues.md) first. The API path passes against Postgres and the live World ID for Agents sandbox. Next: redeploy the web app, claim `pilot` in World App, and turn on notifications. From the push on a 2500 USDC swap, approve and finish World ID once, then deny on World ID once. `pilot` is unowned after migration 0003. `pilot.agent-latch.eth` is registered. The integration debrief is [`docs/world-id-debrief.md`](../world-id-debrief.md).

## Todos

| Phase | Task | State | Testing | Notes |
| --- | --- | --- | --- | --- |
| 0 | Monorepo scaffold | done | passed | Typecheck, lint, apps boot |
| 1 | In-memory control plane | done | passed | Replaced by phase 2 storage |
| 2 | Postgres + Drizzle | done | passed | Migrations apply on API startup |
| 3 | Background agent | done | passed | 100 allow, 2500 waits, 10000 block |
| 4 | ENSv2 | done | passed | `trader.agent-latch.eth` registered |
| 7 | Dashboard | done | passed | `apps/web`. Eden client in `packages/api-client` |
| 5 | World approval | in progress | partial | The owner is a World App wallet. Approve is the owner's `walletAuth` signature plus a World ID for Agents device check (RFC 8628) that the API starts, polls, and validates before the action runs. Deny is one signature, or Deny on World ID. `@agentlatch/world` holds the challenge, `walletAuth` verification (ECDSA, then Safe EIP-1271), pushes, and the device grant. Checks live in `world_id_checks` (migration 0004). API: `/world/*`, `GET /approvals/:id/challenge`, `POST /approvals/:id/decide`. Checked against Postgres and the live sandbox. No human has completed World ID yet |
| 6 | Intercepta + x402 | done | passed | Quick scan and a signed Sepolia USDC settlement |
| later | ENS gate and resolver | done | passed | Missing or expired name blocks the action. `trader.agent-latch.eth` resolver `0xe71b020df50c07DAcE858f47BaC4341f82c82001`, ETH address `0x142B99367b928608835501633534411EFc467737`. Text records: autonomous 500, hard 5000, daily none. Engine still reads Postgres |
| last | Publish a looser ENS policy | todo | not started | Tighter edits write the name now. Raising a limit or adding a permission waits on an owner signature in World App. A policy content hash is post-hackathon |
| 8 | World mini app | in progress | partial | `/mini` claims agents, turns on notifications, and lists pending approvals. `/approve/:id` denies, or approves and then shows the World ID user code with an Open World ID link. The page follows the approval's state until it settles. Desktop links into World App. Pushes fire only when an approval opens. Portal app `app_e84b1b772fa55ee5b4e8a367f169c345` at `https://www.dsapprotocol.xyz`, unverified, so 40 pushes per 4 hours. No logo yet, so not submitted for review. `apps/world-miniapp` stays empty. Live phone push not run |
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
| World App claim and decide against Postgres | done | Scratch database and a second API on 3002, local keys signing MiniKit's exact SIWE layout, agent `pilot` reading the live ENS policy. 25 checks passed: claim refused for an unknown nonce, a reused nonce, or a signature for another agent; claim succeeds; a second wallet gets 409; plain link works; challenge while unclaimed 403; approve and deny challenges differ; a non-owner signature 403; a deny signature cannot approve; an expired signature and a signature for another approval 400; refused attempts leave `PENDING`; approve → `APPROVED` with `decided_by`; replay 409; deny → `REJECTED`; actions `EXECUTED` and `REJECTED`. Push skipped with the key blank. Scratch database dropped |
| Migration 0003 on the dev database | done | The dev API reapplied on restart. OIDC columns gone, `world_wallet` not null, `decided_by` and `decided_at` present. Old owners had no wallet, so `users` is empty and `pilot` is unowned. A 2500 swap logged `world push skipped: ... not claimed in World App` |
| World ID for Agents approve against Postgres | done | Scratch database, a second API on 3002, the live sandbox client, and local keys signing MiniKit's SIWE layout. 31 checks passed. Approve returns a real sandbox link and user code. The action waits (`AWAITING_APPROVAL`, `worldIdStatus` `WAITING`). Public reads hide the code, link, device code, and `sub`. A second approve reuses the check. A stranger's signature gets 403. World App deny gives `REJECTED` with the check `CANCELLED` and its device code cleared. Remaining World outcomes were fed to the settle step: deny gives `REJECTED`, nothing runs; failed and expired checks leave the approval `PENDING`, and approve then starts a new check; verified gives `APPROVED`, `EXECUTED`, `decided_by` set, `sub` stored only in the database; a second outcome is ignored; a proof after the approval expired gives `EXPIRED` and runs nothing. A restart resumes a waiting check, which ends `EXPIRED` with its approval. The client secret and device code never appear in logs. Scratch database dropped |
| Migration 0004 on the dev database | done | The dev API reloaded and applied it. `/world/config` reports `worldIdReady: true` |
| World approval on a phone | todo | Claim `pilot`, notifications on, push on a 2500 swap. Approve and finish World ID (action runs). Deny on World ID (nothing runs). First live Safe EIP-1271 check and first human-completed World ID token, which also shows whether the sandbox `acr` is orb-v3 |
| x402 USDC settlement on Sepolia | done | `GET /x402/resource` is 402. `0.01` USDC to `0x142B99367b928608835501633534411EFc467737` allowed, Intercepta score 0, signed execution, tx `0x22d690597c411be1aebb8c98e508852ae407dfb7df5d8c4bec2772315d956f22`. The same URL with `?tx=` returns 200 |

## Notes

- Amounts are USDC strings. One chain: Ethereum Sepolia.
- Demo policy: autonomous 500, hard limit 5000. No daily cap on the background agent.
- `ens.name` is set when ENSjs returns an owner or the registry status is `REGISTERED`.
- Sepolia demo signer: `0x142B99367b928608835501633534411EFc467737`. Parent name: `agent-latch.eth`.
- `POST /agents/:id/ens` deploys a UserRegistry under `ENS_PARENT_NAME` when needed, then registers the agent label, points it at the signer's Permissioned Resolver, writes the signer's ETH address, and copies the current Postgres policy onto the name when that copy is not looser than the published one. The signer must be the parent owner and hold Sepolia ETH. An action is blocked when that name is missing, expired, or has no published policy. The spending decision reads the name.
- Swaps stay unsigned. An x402 settlement signs and broadcasts. Policy stays free of sponsors.
- The dashboard polls the API through `/api` (Vite proxy locally, Vercel rewrite live, prefix stripped). Every call is a `fetch` with the ngrok header. On desktop, approvals show "Decide in World App", a `world.org/mini-app` link. Approvals expire after 5 minutes. The ENS pill stays `REGISTERED` when the name is registered. Ownership is separate: an unclaimed agent links to `/mini`.
- Inside World App, `/` redirects to `/mini`. `/mini` claims an agent with one `walletAuth` (link and claim together), asks for notification permission, and lists the owner's pending approvals from `GET /world/owner/:wallet`. `/approve/:id` gets the challenge, signs it in World App, and posts `decide`. Deny ends the approval there. Approve returns the World ID user code and link. The owner opens World ID, checks the code, and taps Authenticate with World ID or Deny sign-in. The page follows `worldIdStatus` until the API settles it. Closing the World App prompt changes nothing.
- World ID for Agents uses `WORLD_OIDC_ISSUER`, `WORLD_CLIENT_ID`, and `WORLD_CLIENT_SECRET` on the API. A missing value makes approve 503. Device codes last 20 minutes and approvals 5, so an approval expires before its code does.
- The public Sepolia RPC rate-limits ENS reads (`Request exceeds defined limit.`). An action submit then gets 503, and approve says the ENS name could not be read. Set `SEPOLIA_RPC_URL` to a keyed endpoint for the demo.
- Pushes use `WORLD_APP_ID` and `WORLD_NOTIFICATION_API_KEY` and fire only when an action opens an approval. A missing key or an unclaimed agent skips the push with a log line. A push World refuses logs its reason.
- The payments page lists `X402_PAYMENT` actions. Each one is quick-scanned before execution. A clear scan settles Circle USDC with EIP-3009. The signer pays Sepolia gas. A missing key, a 404 from the scan, or a failed settlement refuses the payment. Live traits may omit `txsCount`.
