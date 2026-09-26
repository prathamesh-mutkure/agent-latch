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
- No login in Phase 1. A wallet-signed owner session comes when the dashboard needs an owner. World ID stays the Phase 5 step-up for exceptional actions, not the login.
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

- Policy stays in Postgres. `evaluatePolicy` reads the `policies` table. ENS stays identity. Copying rules onto ENS text records is last, after the Postgres policy path is finished.
- Payments stay on Ethereum Sepolia. Do not add Base.
- Intercepta stays. The action service screens `X402_PAYMENT` after policy and before signing.
- Stack stays this repo: Elysia, Drizzle, and the current packages. `GET /x402/resource` is the paid resource. Do not add a Hono seller app. Do not rename the product. Do not replace `ActionRequest` with `POST /api/v1/fetch`.
- Signer custody and the World approval shape stay open in `open-questions.md`.

## 2026-09-26 — ENS name gates actions

- `POST /agents/:id/ens` deploys one Permissioned Resolver for the signer when needed, points the name at it, and writes the signer's ETH address with `setAddress`. A name that is already registered is updated instead of registered again.
- `submitAction` records `BLOCK` when the name is not `REGISTERED` or is expired. An ENS read failure returns 503 and does not execute. Approve uses the same check before execution.
- Policy still comes from Postgres. Policy text records are not written.

## How to change a decision

Add a new dated section that names what it supersedes. Leave the old section in place and mark it superseded.
