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
- Demo signer is one Ethereum Sepolia private key in `EXECUTOR_PRIVATE_KEY`. Only the executor reads it, with viem `privateKeyToAccount`. It signs only after `ALLOW` or a still-valid scoped approval for that exact action. Policy and the API do not sign. This is a testnet hot wallet, the same pattern as AgentKit and typical x402 examples, not production custody.
- One chain: Ethereum Sepolia, chain id `11155111`.
- One asset: Circle USDC at `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, 6 decimals. Policy amounts are USDC and display as dollars. No price oracle.
- x402 uses that same USDC on Sepolia (`ethereum-sepolia` / `eip155:11155111`). Coinbase's CDP facilitator does not list Ethereum Sepolia. Use a facilitator that does. Do not add Base to follow the CDP list.
- The background agent polls the API until an approval is approved, rejected, or expired. No websockets.
- No login in Phase 1. A wallet-signed owner session comes when the dashboard needs an owner. World ID stays the Phase 5 step-up for exceptional actions, not the login.
- The repo is public and open source. Do not add a license file unless a sponsor form requires one.
- `AGENTS.md` is the agent entrypoint for Cursor and Codex. `CLAUDE.md` only pulls in `AGENTS.md` for Claude Code. Do not keep a second copy of the rules.

## How to change a decision

Add a new dated section that names what it supersedes. Leave the old section in place and mark it superseded.
