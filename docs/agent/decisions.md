# Decisions

Closed choices. Do not relitigate them unless a new dated entry supersedes them.

## 2026-09-26 — Product and stack

From `planning.md`, treated as closed:

- AgentLatch is a control plane. It is not a wallet, a trading bot, or a checkout.
- Every privileged action is an `ActionRequest`. The policy result is `ALLOW`, `BLOCK`, or `HUMAN_APPROVAL`.
- Policy does not know which executor will run the action.
- Runtime is Bun. Monorepo is Bun workspaces plus Turborepo. Language is TypeScript.
- Web is React, Vite, TanStack Router, TanStack Query, and Tailwind. No Next.js.
- API is Elysia on Bun. Fall back to NestJS only if Elysia blocks a demo path.
- Database, when added in Phase 2, is PostgreSQL and Drizzle. Not Prisma.
- Contracts, when added, are Solidity and Foundry. ENS chain is Ethereum Sepolia.
- ENS is identity. World is human authorization. Intercepta is payment risk. x402 is machine payments. Uniswap is optional and last (Phase 9).
- Web dashboard is the MVP approval surface. World is Phase 5. Telegram, if used, is a notification link, not the authorization check.
- Sponsor integrations are added one phase at a time, after the control plane works.

## 2026-09-26 — Repository shape

- Package names are `@agentlatch/web`, `@agentlatch/api`, `@agentlatch/agent`, and `@agentlatch/core`.
- `@agentlatch/core` is one package. `types`, `policy`, and `authorization` are internal modules, filled in Phase 1.
- Foundry lives in `/contracts`. `packages/contracts` is reserved for later TypeScript bindings. The plan's `docs/project-context.md` path is not used; agent context stays in `docs/agent/`.
- The in-repo agent calls the API. `packages/sdk` stays empty until a client outside this repo needs it.
- `packages/api-client` is the Eden client and waits until the dashboard calls the API.
- Routes in the web app are code-based until there are enough pages to justify file-based routing.
- Lint and format with Biome. Test runner choice superseded the same day by "Hackathon constraints" below.
- Web dev server is port 5173. API is port 3001. Root `.env` is optional; `.env.example` lists later keys.
- Do not implement a `.gitkeep` module before its phase.

## 2026-09-26 — Hackathon constraints

- No unit tests. Do not add a test runner, test files, or a CI test step. Typecheck and lint are the checks. The demo is the verification. This supersedes "run tests" in `planning.md` for this hackathon.
- Demo signer was one Ethereum Sepolia private key. Superseded the same day by "Signer is its own module" below. Policy and the API still do not sign.
- One chain: Ethereum Sepolia, chain id `11155111`.
- One asset: Circle USDC at `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, 6 decimals. Policy amounts are USDC and display as dollars. No price oracle.
- x402 uses that same USDC on Sepolia (`ethereum-sepolia` / `eip155:11155111`). Coinbase's CDP facilitator does not list Ethereum Sepolia. Use a facilitator that does. Do not add Base to follow the CDP list.
- The background agent polls the API until an approval is approved, rejected, or expired. No websockets.
- No login in Phase 1. A wallet-signed owner session comes when the dashboard needs an owner. World ID stays the Phase 5 step-up for exceptional actions, not the login. Superseded by "World ID for Agents" below.
- The repo is public and open source. Do not add a license file unless a sponsor form requires one.
- `AGENTS.md` is the agent entrypoint for Cursor and Codex. `CLAUDE.md` only pulls in `AGENTS.md` for Claude Code. Do not keep a second copy of the rules.

## 2026-09-26 — API modules

- HTTP is split by resource under `apps/api/src/modules/{health,agents,actions,approvals}`. Each resource has `routes.ts`, Zod `schemas.ts`, `dto.ts`, and `service.ts`.
- Response mappers are `toPolicyDto`, `toActionDto`, and `toApprovalDto`. Agents are returned as stored because that shape is already the response.
- Request validation is Zod. Elysia accepts it through Standard Schema. Do not add TypeBox `t` schemas.
- `@agentlatch/core` stays free of Zod and HTTP. The in-memory store stays in `memory.ts`.

## 2026-09-26 — Signer is its own module

Supersedes the demo-signer bullet in "Hackathon constraints".

Signing is a third axis, next to policy and executors. Policy decides whether an action may happen. An executor performs one kind of action. A signer produces the signature for that action. None of the three imports the others' implementations.

- The interface is `AgentSigner`: the agent address, plus `sign` for one already-authorized action. It will live in `@agentlatch/core` when the first real signer is added. Do not add it before then.
- An executor receives a signer. It does not read `EXECUTOR_PRIVATE_KEY`, construct a viem account, or import Alchemy.
- `LocalKeySigner` is the hackathon default: one Sepolia private key in `EXECUTOR_PRIVATE_KEY`, viem `privateKeyToAccount`. It signs only after `ALLOW` or a still-valid scoped approval for that exact action. Testnet hot wallet, not production custody.
- `AlchemySmartAccountSigner` is an optional extension, not the default and not Phase 2. It submits an ERC-4337 user operation through Alchemy Account Kit. The smart account address is the agent wallet. The owner key can still be the same demo key. Alchemy does not replace authorization.
- Owner login, when it exists, is a separate wallet. Do not use the agent signer for the dashboard session.

## 2026-09-26 — Database

- Postgres runs from Docker Compose. SQL migrations are `db/migrations`. Schema path superseded the same day by "Schema location" below.
- Tables are agents, policies, actions, executions, approvals, and audit_events.
- `users`, `capabilities`, and `payments` stay out until those features exist.
- The API does not keep an in-memory store.

## 2026-09-26 — Schema location

Supersedes the schema path in "Database".

- Each API module owns its Drizzle tables in `schema.ts`. Row-to-domain mapping lives in that module's `dto.ts`.
- `apps/api/src/db/schema.ts` only re-exports the tables for the client and drizzle-kit.
- SQL migrations stay in `db/migrations`.

## 2026-09-26 — Migrations on startup

The API applies `db/migrations` before it listens. `bun run db:migrate` still applies them without booting the API. `infra:reset` still migrates after recreating Postgres.

## 2026-09-26 — ENSv2

- Sepolia ENSv2 addresses live in `@agentlatch/ens` and come from the deployments page. `ENS_REGISTRY_ADDRESS` overrides the default ETHRegistry. The contracts are beta.
- Agent identity status, parent namespace, and EAC roles are read with `getState`, `getParent`, and `hasRoles`. A full name is returned only when status is `REGISTERED`. Resolution of that name is superseded below.
- `POST /agents/:id/ens` calls `register` with the demo key. On the ETHRegistry that call reverts unless the key holds `ROLE_REGISTRAR`. Point `ENS_REGISTRY_ADDRESS` at a UserRegistry the key can register on to create subnames such as `trader.alice.eth`.

## 2026-09-26 — ENSjs for resolution

Supersedes the name-resolution sentence in "ENSv2".

- ENSjs (`@ensdomains/ensjs`) resolves the full name with `getOwner` and `getAddressRecord` on Sepolia whenever the parent namespace is known.
- Registry status, EAC roles, parent namespace, and `register` stay direct Permissioned Registry calls. `ens.name` is set when ENSjs returns an owner or the registry status is `REGISTERED`.

## 2026-09-26 — ENS subnames

Supersedes the `POST /agents/:id/ens` sentence in "ENSv2".

- Parent name defaults to `agent-latch.eth` (`ENS_PARENT_NAME`). Owner for the demo signer is `0x142B99367b928608835501633534411EFc467737`.
- Registration deploys a UserRegistry through the Sepolia Verifiable Factory when `getSubregistry` is empty, then `setSubregistry`, `setParent`, and `register`.
- The signer is `EXECUTOR_PRIVATE_KEY` and must be the parent owner. Sepolia ETH pays gas.

## 2026-09-26 — Intercepta quick scan

- `@agentlatch/intercepta` calls `GET https://api.web3antivirus.io/api/public/v2/extension/account/{address}/quick-scan` with header `X-API-KEY`. Docs: https://docs.web3antivirus.io/reference/quick-scan-address
- Scan Message stays unused. Its chain id list does not include Sepolia `11155111`.
- A payment is blocked when `toxicScore` is above 0 or any trait is returned. Those traits are the suspicious-activity list. The docs do not publish a higher cutoff.
- Policy does not import Intercepta. The action service screens `X402_PAYMENT` after policy and before execution. A missing `INTERCEPTA_API_KEY` refuses the payment.
- x402 signing is still later. A clear screen uses the existing simulated execution. Superseded the same day by "x402 settles on Ethereum Sepolia" below. Intercepta still screens before settlement.

## 2026-09-26 — x402 settles on Ethereum Sepolia

- Network stays `eip155:11155111`. Asset stays Circle USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, EIP-712 name `USDC`, version `2`.
- The public x402.org facilitator and PayAI do not list that network. CDP does not either. Paratro lists it, but `/x402/settle` only broadcasts authorizations it signed itself. Do not move the demo to Base to follow those lists.
- Settlement is on-chain. The signer first signs an EIP-712 `transferWithAuthorization` message. That signature does not move USDC. The same signer then sends the Sepolia transaction that submits the signature to the USDC contract, and pays the gas. A facilitator would normally send that transaction. "Outside signature" means the authorization was signed by our demo key, not by a facilitator's wallet. Policy and Intercepta still run before the broadcast.
- `AgentSigner` lives in `@agentlatch/core`. `LocalKeySigner` reads `EXECUTOR_PRIVATE_KEY`. The executor receives the signer and does not read the key.

## 2026-09-26 — Continuation from planning-v2

Supersedes the parts of `planning-v2.md` that use Base, a Hono seller service, drop Intercepta, rename the product, or store policy in ENS now. The handoff is `continuation.md`.

- Policy stays in Postgres. `evaluatePolicy` reads the `policies` table. ENS stays identity. Copying rules onto ENS text records is last, after the Postgres policy path is finished. Superseded the same day by "Published policy is read from ENS" below.
- Payments stay on Ethereum Sepolia. Do not add Base.
- Intercepta stays. The action service screens `X402_PAYMENT` after policy and before signing.
- Stack stays this repo: Elysia, Drizzle, and the current packages. `GET /x402/resource` is the paid resource. Do not add a Hono seller app. Do not rename the product. Do not replace `ActionRequest` with `POST /api/v1/fetch`.
- Signer custody and the World approval shape stay open in `open-questions.md`.

## 2026-09-26 — ENS name gates actions

- `POST /agents/:id/ens` deploys one Permissioned Resolver for the signer when needed, points the name at it, and writes the signer's ETH address with `setAddress`. A name that is already registered is updated instead of registered again.
- `submitAction` records `BLOCK` when the name is not `REGISTERED` or is expired. An ENS read failure returns 503 and does not execute. Approve uses the same check before execution.
- `POST /agents/:id/ens` copies the current Postgres policy onto the name as text records: autonomous limit, hard limit, daily limit, actions, tokens, and targets. Superseded the same day by "Published policy is read from ENS" below for where the decision is read. Raising a limit on the name stays later.

## 2026-09-26 — Published policy is read from ENS

Supersedes the Postgres-only policy sentences in "Continuation from planning-v2" and "ENS name gates actions".

- `evaluatePolicy` stays a pure function. The action service loads its input from the name's text records. A missing record blocks the action. A failed read returns 503. There is no fallback to Postgres.
- Postgres still stores the policy the owner last saved. Registration copies it onto the name.
- A tighter edit writes the name first, then Postgres. A tighter edit lowers a limit, adds a daily cap, removes an action, or narrows targets.
- A looser edit is rejected. Raising a limit, removing the daily cap, or adding an action or target is not published until a later World check.
- Post-hackathon, replace the plaintext text records with an ENS content hash of the policy so the limits are not public. The decision still checks that hash against the saved policy. Do not build that for the demo.

## 2026-09-26 — World ID for Agents

Superseded by "World App is the only human surface" (2026-09-27).

Supersedes the login bullet in "Hackathon constraints" and closes "World approval shape" in `open-questions.md`. Follows the World sections of `planning-v2.md`. Later dated entries in this file, and `issues.md`, supersede the old handover notes.

- World ID for Agents (OIDC, `https://sandbox.auth.world.org`) is the owner login and the step-up. One confidential client, `client_secret_basic`, all OIDC work on the API with `openid-client` v6. No IDKit, no World code in the browser.
- `@agentlatch/world` in `packages/integrations/world` holds discovery, the authorize URL, the code exchange, `computeBindingHash`, and the pure `checkApprovalTicket`. It imports no database, Elysia, policy, executor, or signer code.
- Sign-in stores `(world_iss, world_sub)` in `users` and sets a signed, http-only `SameSite=Lax` session cookie (`COOKIE_SECRET`). `sub` never goes onchain.
- An agent's owner is `agents.user_id`. Agents created from a session get it. An unowned agent, such as the background agent's `trader`, is claimed with `POST /agents/:id/claim`.
- `POST /approvals/:id/approve` is removed. Approve is only `GET /auth/world/step-up?approval=:id`, which reruns sign-in with `max_age=0`, `acr_values=https://world.org/oidc/acr/orb-v3`, and `nonce = binding_hash`. The callback runs the checks, then executes through the existing settle path.
- Checks, in order: pending, not expired, stored hash = recomputed hash = cookie nonce (`BINDING`), token `(iss, sub)` is the owner (`WRONG_HUMAN`), `auth_time` within `step_up_started_at` − 30 s and now + 30 s (`STALE_VERIFICATION`). A failure sets approval `FAILED` with `failure_reason`. A settlement failure is `FAILED: PAYMENT_FAILED`.
- `binding_hash = sha256(approvalId | agentId | action | target | token | amount | nonce | expiresAt)`, stored when the approval opens.
- Deny is `POST /approvals/:id/deny`, owner session required. It sets `REJECTED`. Cancelling on the World screen sets `CANCELLED`. Superseded by "Deny needs World ID too" below.
- Approvals expire after 5 minutes, per the architecture doc.
- Local callback is `https://app.agentlatch.test:5173/auth/world/callback`. Vite proxies `/auth` and `/api` (prefix stripped) to the API, so the page, API, and callback share one origin. The API routes keep their names without an `/api` prefix.
- Freshness is checked against `step_up_started_at`, not approval creation as the architecture doc says. World's step-up guide ties `auth_time` to the attempt start for `max_age=0`.
- Agent-facing reads (`GET /approvals`, `GET /approvals/:id`) stay open because the background agent polls them.

## 2026-09-26 — Deny needs World ID too

Superseded by "World App is the only human surface" (2026-09-27).

Supersedes the deny bullet in "World ID for Agents".

- Deny needs the same fresh World ID step-up as approve: `GET /auth/world/step-up?approval=:id&decision=deny`. `POST /approvals/:id/deny` is removed. No route changes an approval without a World ticket.
- The step-up nonce binds the decision: approve uses `binding_hash`, deny uses `sha256(binding_hash|deny)`. A proof made for one decision fails the other with `BINDING`.
- A validated deny sets `REJECTED` and records `world_auth_time`. The same checks apply, so a deny from another World account is `FAILED: WRONG_HUMAN`.
- Backing out of World during a deny leaves the approval `PENDING`. Backing out during an approve still sets `CANCELLED`.
- After the World checks pass, approve runs the ENS passport check from "ENS name gates actions" before executing. A missing or expired name sets `FAILED: PASSPORT_INACTIVE`. An ENS read failure executes nothing and leaves the approval `PENDING`.

## 2026-09-26 — World App notifications

Superseded by "World App is the only human surface" (2026-09-27).

The mini app is the phone surface for approvals. It does not replace the World ID step-up, and it does not sign.

- The owner is the World ID `(iss, sub)` from sign-in. The ENS name owner is the API signer, so it is not the human.
- `users.world_wallet` is the World App wallet from a verified SIWE link. Pushes are addressed to that wallet. `GET /auth/world/step-up` remains the only approve and deny path.
- The phone UI is `/mini` on `apps/web`, the same host as `WORLD_REDIRECT_URI`. `apps/world-miniapp` stays empty so a second host does not create a second World `sub`.
- A missing `WORLD_APP_ID`, a missing notification key, or no linked wallet skips the push. The approval still opens.

## 2026-09-27 — World step-up does not auto-approve

Superseded by "World App is the only human surface" (2026-09-27).

Supersedes the step-up redirect in "World ID for Agents" for how the browser reaches World. The ticket checks stay, with one added claim.

- The sandbox page auto-runs ceremony, approve, and complete when the browser that opened the authorize URL is the initiator. That path issues a fake orb identity and would settle the action with no human click.
- `GET /auth/world/step-up` starts the request on the API and keeps the initiator cookie in the attempt cookie. The browser goes to `/approve/:id?handoff=1` and opens World's human page without that cookie.
- The API redeems the code only after World reports the transaction `approved`. `verified` is not enough. Sign-in still sends the browser to the authorize URL.
- A fresh step-up sends `prompt=login` as well as `max_age=0` and the orb `acr_values`. The ticket must carry `acr` `https://world.org/oidc/acr/orb-v3`, or the approval fails `WEAK_PROOF`.

## 2026-09-27 — Step-up uses the signed-in human

Superseded by "World App is the only human surface" (2026-09-27).

Supersedes the server-started ceremony in "World step-up does not auto-approve".

- The sandbox creates a new person for every ceremony the server starts. That ticket is not the owner, so approval failed `WRONG_HUMAN`.
- The browser that signed in opens the authorize URL. `prompt=login` is not sent, so World can reuse that session. `max_age=0` and the orb `acr` stay.
- A passing ticket does not run the action. The approval page shows Confirm, and only that click calls `decideWithWorld`.
- `auth_time` may be up to 30 minutes before the attempt, so the sign-in from this session still counts.

## 2026-09-27 — World App is the only human surface

Partly superseded by "World ID for Agents confirms every approve" (2026-09-27): the one-product rule, the approve path, and the tradeoff. Pushes, the challenge, and deny stand. Also partly superseded by "Owner accounts" (2026-09-27): no sessions, link and claim, the open approval list, and the desktop dashboard reading everything.

Supersedes "World ID for Agents", "Deny needs World ID too", "World App notifications", "World step-up does not auto-approve", and "Step-up uses the signed-in human".

- Why: World is here for one job. When an action is past policy, reach the owner out of band and take their approve or deny. The World ID for Agents sandbox mocks a new person for every ceremony, so the owner never matched (`WRONG_HUMAN`), and its page could approve with no human click.
- One World product: the World App mini app (MiniKit). No OIDC, sessions, cookies, `/auth` routes, `openid-client`, or `COOKIE_SECRET`.
- The owner is a World App wallet. `users.world_wallet` (lower case, unique, not null) replaces `(world_iss, world_sub)`. `agents.user_id` still names the owner.
- Link and claim: `GET /world/nonce` issues a one-time nonce, held in memory for 10 minutes. The mini app signs it with `MiniKit.walletAuth`. `POST /world/link` verifies it and upserts the owner. With `agentId`, the SIWE request ID is that agent ID, and the same signature claims the unowned agent. Without it the request ID is `link`. `POST /agents/:id/claim` is removed, and new agents start unowned.
- Verification is `verifySiweMessage` from `@worldcoin/minikit-js/siwe`: nonce, statement, request ID, expiry, then ECDSA recovery, then Safe EIP-1271 on World Chain (`WORLDCHAIN_RPC_URL`, optional). World App wallets are Safes, so ECDSA alone is wrong.
- Push only when an action opens an approval. Allow and block do not push. The push is fire and forget, goes to the owner's wallet through `developer.world.org/api/v2/minikit/send-notification`, and opens `/approve/:id` in the mini app. Unverified mini apps get 40 pushes per 4 hours.
- Decide: `GET /approvals/:id/challenge?decision=approve|deny` returns what World App signs. `nonce = sha256(binding_hash | decision)`, request ID = approval ID, expiry = approval expiry, and the one-line statement names the verb, action, amount, and agent. `POST /approvals/:id/decide` verifies the signature before the row lock and requires the owner's wallet. Under the lock it rechecks pending, an unchanged owner, and stored = recomputed `binding_hash` (else `FAILED: BINDING`). Deny sets `REJECTED`. Approve runs the ENS passport check and the existing settle path. `decided_by` and `decided_at` record the wallet and time. A bad or foreign signature is 400 or 403 and changes nothing.
- No route changes an approval without the owner's World App signature. Agent-facing reads (`GET /approvals`, `GET /approvals/:id`) stay open.
- The browser reaches the API only by `fetch` through `/api` with `ngrok-skip-browser-warning`. Nothing navigates to the API, so the ngrok interstitial is out of the flow.
- The desktop dashboard does not decide. It links into World App with `MiniKit.getMiniAppUrl`. `/mini` and `/approve/:id` act only inside World App.
- Kept: the `binding_hash` formula, 5-minute approvals, the passport check before execution, and `FAILED` reasons `BINDING`, `PASSPORT_INACTIVE`, and `PAYMENT_FAILED`. Gone: `WRONG_HUMAN`, `STALE_VERIFICATION`, `WEAK_PROOF`, and `CANCELLED` from the World screen.
- Tradeoff: a decision proves the wallet, not personhood. The event's World prizes need IDKit or World ID for Agents. See "World ID proof on approve" in `open-questions.md`.

## 2026-09-27 — World ID for Agents confirms every approve

Supersedes the one-product bullet, the approve half of the decide bullet, and the tradeoff bullet in "World App is the only human surface". Closes "World ID proof on approve" in `open-questions.md` with World ID for Agents, not IDKit.

- Why: the ETHGlobal World ID for Agents track requires the official sandbox, the full journey (request, human completion, backend-validated result, protected action), an unsuccessful path where nothing runs, and backend validation. A wallet signature proves the wallet, not a fresh human.
- Two World products, one job each. World App (MiniKit) is the channel and the owner: claim, pushes, and the wallet signature. World ID for Agents (`https://sandbox.auth.world.org`, RFC 8628 device grant) is the fresh human check on every approve. No IDKit, no `configure_world_id`, no on-chain RP.
- Device grant, not the browser code flow. The backend starts it with the client secret. No callback, cookie, state, or PKCE. Every attempt needs a fresh proof and an explicit Approve or Deny on World's page, and World's page never auto-approves it.
- Approve: the owner signs the approve challenge. The API verifies the wallet, the binding, and the ENS passport, then calls `device_authorization` (`scope=openid`, `client_secret_basic`, `openid-client` v6) and stores the attempt in `world_id_checks`. Only the signer gets the approval link and user code in the `decide` response. A second approve returns the check that is still waiting.
- The API polls the token endpoint in the background, one poller per check. It honours `interval` and `slow_down`, stops at the approval's expiry, and resumes waiting checks on boot.
- A token counts only if its signature verifies against World's JWKS (`enableNonRepudiationChecks`), `iss`, `aud`, `exp`, and `iat` pass, `acr` is `https://world.org/oidc/acr/orb-v3`, and `auth_time` falls between the check's start − 60 s and now + 60 s. Device ID tokens carry no nonce. The binding is the device code, which never leaves the API and belongs to one approval.
- Under the approval lock the API rechecks: still pending, the owner's wallet is the signer, the binding hash is the one stored at check start and still recomputes, and the passport. Then the existing settle path runs. `APPROVED` records `decided_by`. The check stores the pairwise `sub` and `auth_time`, backend only.
- Unsuccessful paths. Deny on World ID sets `REJECTED` (check `DENIED`). Deny in World App sets `REJECTED`, cancels the waiting check, and stops polling. An expired World code, a token that fails validation, a World error, or an unreadable ENS name leaves the approval `PENDING`, and the owner can approve again. An expired approval is `EXPIRED`, and a proof that arrives later runs nothing.
- The owner is still the wallet, not the World ID `sub`. The sandbox mocks a new person for every proof, so an `(iss, sub)` match fails every time (the old `WRONG_HUMAN`). The `sub` is evidence only. If production subjects are stable, link `(iss, sub)` at claim and require it on approve.
- Public reads expose `worldIdStatus` and `worldIdError`. The device code, user code, link, and `sub` never appear there.
- Env on the API only: `WORLD_OIDC_ISSUER`, `WORLD_CLIENT_ID`, `WORLD_CLIENT_SECRET`. Missing values make approve 503. `WORLD_REDIRECT_URI` stays registered in the portal because device clients still need one, but the code does not read it. `COOKIE_SECRET` is unused.

## 2026-09-27 — AgentLatch runs its own x402 facilitator

Supersedes the self-settled payment and the `?tx=` receipt check on `GET /x402/resource`.

- Why: public facilitators do not settle on Ethereum Sepolia, and payments stay on Sepolia. The buyer used to broadcast its own transfer and hand the seller a transaction hash. That is not x402, so the same agent could not pay a real seller. The receipt check also accepted any successful USDC transfer, whatever the payee or amount.
- x402 v2 headers. The seller quotes 402 with `PAYMENT-REQUIRED`. The buyer retries with `PAYMENT-SIGNATURE`, a signed EIP-3009 authorization that nobody has broadcast. The seller answers 200 with `PAYMENT-RESPONSE`.
- The facilitator is `POST /facilitator/verify`, `POST /facilitator/settle`, and `GET /facilitator/supported` on the API. Verify checks the scheme, network, and asset, that the payee and amount match the requirement exactly, the time window, the signature against `from`, the payer's USDC balance, and that the nonce is unused. Settle verifies again, then broadcasts `transferWithAuthorization` and pays gas.
- The facilitator settles only for AgentLatch's own seller payee (`X402_PAY_TO`), so strangers cannot spend its gas. Key: `FACILITATOR_PRIVATE_KEY`, else `EXECUTOR_PRIVATE_KEY`.
- The demo seller calls the facilitator over HTTP at `FACILITATOR_URL` (default `http://localhost:$PORT/facilitator`), as a real seller would.
- `X402_PAYMENT.target` is the resource URL, not the payee. On submit the API asks the URL for its quote. The quote must be exact Sepolia USDC for exactly the action's amount. Intercepta screens the quote's `payTo`. After an allow, the executor key signs and the API retries the URL. An approved payment quotes and screens again before it signs, because the seller may have changed its payee.
- Unchanged: policy, the order policy then Intercepta then signing, one `LocalKeySigner`. Signer custody is still open.

## 2026-09-27 — MCP server for x402 payments

Supersedes "MCP server and SDK packages" in the cut column of `planning-v2.md`. The SDK package stays cut. The name lookup is superseded by "Owner accounts" below.

- Why: Ankit asked for AI agents (Claude, Cursor) to find AgentLatch's x402 sellers and pay them through the gate.
- `apps/mcp` is a stdio MCP server. It is a client of the API, not a signer. It holds no key and never builds a `PAYMENT-SIGNATURE`. A payment is an `X402_PAYMENT` action, so the order stays policy, then Intercepta, then signing, and a payment above the autonomous limit waits for World approval.
- Tools: `list_merchants`, `quote_resource`, `pay_resource`, `get_payment`, `list_payments`. `pay_resource` takes the agent's `maxAmountUsdc`, quotes the URL, and submits the quoted price only when it is at or below that maximum.
- The merchant registry is `GET /x402/merchants` on the API. For now it lists AgentLatch's own demo seller, the only payee its facilitator settles for. No Bazaar discovery.
- The agent is picked by `AGENTLATCH_AGENT_ID` or `AGENT_NAME`. The API has no agent keys yet, so anyone who can reach the API can submit as any agent. The pasted-key login in `planning-v2.md` future work is still open. Superseded by "Agent keys": the server sends `AGENT_KEY`, and submitting without it is refused.

## 2026-09-27 — Owner accounts

Supersedes, in "World App is the only human surface": "no sessions", the link and claim bullet, and the open approval list. Step 1 of the multi-user plan in `continuation.md`.

- Why: every visitor saw every agent, and the first wallet to claim an agent became its only approver. Each owner now signs up, owns the agents they create, and sees only those.
- The account is still the World App wallet (`users.world_wallet`). No new identity, no OIDC, no cookie.
- Sign-in inside World App: `GET /world/nonce`, one `MiniKit.walletAuth` (request ID `link`), then `POST /world/sign-in`. The first sign-in creates the user. It replaces `POST /world/link`. `agentId` and claiming are gone.
- Session: a bearer token, `base64url(claims).HMAC-SHA256` over user ID, wallet, and expiry, signed with `SESSION_SECRET` (API only). Lasts 24 hours. The browser keeps it in local storage and sends `Authorization: Bearer`. There is no server-side revocation. Signing out drops the token. Without `SESSION_SECRET` the API makes a random secret per process, so sign-ins end on restart.
- Desktop sign-in by QR: `POST /world/pair` returns an 8-character code and a 32-byte secret. The QR opens `/pair/<code>` in World App. `GET /world/pair/:code` returns the challenge (request ID `pair-<code>`, a statement naming the code). The phone signs it and posts to `POST /world/pair/:code`, which signs the phone in too. The computer polls `POST /world/pair/:code/session` with the secret and gets its session once. Codes live in API memory for 5 minutes and work once. Only the computer holds the secret, so seeing the QR is not enough to take the session.
- Owner only, 401 without a session, 404 for another owner's agent: `GET /agents`, `GET /agents/:id`, `POST /agents`, policy read and write, `POST /agents/:id/ens`, `GET /agents/:id/audit`, `GET /approvals`, and `GET /me` (replaces `GET /world/owner/:wallet`).
- Still open, because `apps/mcp` submits and reads payments with no owner session: `POST /agents/:id/actions`, `GET /agents/:id/actions`, `GET /actions/:id`, and `GET /approvals/:id`. The MCP server pays as `AGENTLATCH_AGENT_ID`, else `AGENT_ID`. It does not look agents up by name. That supersedes the name lookup in "MCP server for x402 payments". Agent keys close these routes later. The challenge and `decide` stay signature-gated, not session-gated. Superseded by "Agent keys" for the action routes. `GET /approvals/:id` stays open.
- `POST /agents` creates the agent owned by the caller. The name is the ENS label: 3 to 32 lower-case letters, digits, and dashes, unique ignoring case (migration 0005). A taken name is 409.
- The background agent acts for `AGENT_ID` and never lists or creates agents. Without it the process idles.
- `pilot` was already owned by `0xe5f5617c6996cd0f1b6afe02856f23f46296ad5c`, so no owner moved.

## 2026-09-27 — Agent keys

Supersedes the open action routes in "Owner accounts" and the "no agent keys yet" sentence in "MCP server for x402 payments". Step 2 of the multi-user plan in `continuation.md`.

- Why: anyone who knew an agent id could submit an action for it. The agent now has its own key, separate from the owner's sign-in.
- `POST /agents` creates the agent, stores only the SHA-256 of a new key, and returns the key once (`alk_` plus 32 random bytes). It also saves the demo policy, 500 USDC autonomous and 5000 hard. The register button then calls `POST /agents/:id/ens`, which spends Sepolia gas. `POST /agents/:id/key` replaces the key and returns the new one once. The old key stops working. The key is never logged or stored.
- The agent and `apps/mcp` send it as `x-agent-key`. The owner's bearer token stays `Authorization`. `AGENT_KEY` in `.env` is what the background agent and the MCP server send.
- `POST /agents/:id/actions` requires the key. The owner's session is not enough.
- `GET /agents/:id/actions`, `GET /actions/:id`, `GET /agents/:id/policy`, and `GET /agents/:id/audit` accept the key or the owner's session. Another owner's session is 404.
- `GET /approvals/:id` stays open. World App opens that page from a push without the agent key. The background agent polls it the same way.
- Agents created before this, including `pilot`, have no key until the owner creates one on the agent's page.
- `apps/mcp` also gained `request_swap`, `wait_for_approval` (polls for 45 seconds), `get_policy`, and `recent_activity`.

## 2026-09-27 — Agent ids are ENS names, and agents with an ENS key sign submits

Builds on "Agent keys". Supersedes nothing there: the agent key stays required.

- An agent's id is its ENS name, `name.username.<parent>`, for example `trader.alice.agent-latch.eth`. Agents created before the owner set a username keep `name.<parent>`.
- The owner's username is `users.username`, an ENS label with the same rules as agent names, unique, set once with `PUT /me/username` (signed in). `POST /agents` copies it onto the agent. Names stay unique ignoring case across all owners (migration 0005), so the username adds a namespace, not free names.
- `POST /agents` takes an optional `authAddress`, an address whose private key only the agent holds. `POST /agents/:id/ens` registers `username.<parent>` first when it is missing (owned by the executor key), then the agent name with `authAddress` as its ETH record. The `alk_` key is a bearer secret the API issued. The `authAddress` key is what the agent's ENS name says it is.
- `POST /agents/:id/actions` checks the agent key first. An agent with an `authAddress` must also send `x-agentlatch-agent` (the ENS name), `-timestamp` (unix seconds, 60 seconds each way), `-nonce`, and `-signature`: an EIP-191 signature over `agentRequestMessage` in `@agentlatch/core`, which covers method, path with query, and the body's SHA-256. Reads follow "Agent keys".
- The API checks the signature against `authAddress` in Postgres, not by reading the ENS record on every request. Used nonces are held in memory, so one API process only. Migration 0007.
- `apps/mcp` signs its submits when `AGENT_PRIVATE_KEY` and `AGENTLATCH_AGENT_ENS` are set, next to `AGENT_KEY`. `GET /agents/:id` is owner only, so the name comes from `.env`. That key only signs requests. It never signs a payment.

## 2026-09-27 — ENS registration runs in the background

- Why: registering takes one to two minutes of Sepolia transactions, and more for a new username. Vercel's rewrite to the API gave up first (`ROUTER_EXTERNAL_TARGET_ERROR`), so the page never learned the result.
- `POST /agents/:id/ens` answers 202 with `{ state: "REGISTERING" }` and runs the job on the API. Agent reads carry `registration`: `REGISTERING`, `FAILED` with the error, or null once done. A second call while one runs returns the same job. A failed job can be started again from the agent's page.
- Jobs run one at a time because they share the executor key and its nonce. The state is in API memory, so a restart forgets a running job. Registering again resumes from what is already on chain.

## How to change a decision

Add a new dated section that names what it supersedes. Leave the old section in place and mark it superseded.
