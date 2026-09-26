# ETHGlobal Tokyo 2026 submission copy

Paste these into the ETHGlobal project form. Prize tracks: **Best Use of World ID for Agents**, **Best Use of ENSv2**, **Best Uniswap Stack Contribution**. Intercepta stays in the product description. We are not applying for that prize. Continuity-track ENS and Uniswap prizes do not apply.

Live demo: https://www.dsapprotocol.xyz
Repo: https://github.com/prathamesh-mutkure/agent-latch

## Short description

93 characters:

```text
ENS-named agents swap on Uniswap; anything over the limit waits for a World ID-verified human
```

## Description

```text
Delegated Spend Authorization Protocol lets you give an AI agent a budget without giving it your wallet. The agent never holds a key or builds a transaction. It asks to pay for an x402 API, swap on Uniswap, or send USDC, and every request gets one of three answers: allow, block, or ask a human.

Each agent gets its own ENSv2 name, like scout.alice.agent-latch.eth, with its own Permissioned Resolver. Its rules live in text records on that name: an autonomous limit, a hard limit, a daily cap, and the allowed actions, tokens, and targets. The API reads the name every time it decides. If the name is missing or expired, or no policy is published, the agent cannot act. Tightening a limit writes to the name right away. Loosening one needs the owner's signature.

Under the demo policy, 0.2 USDC runs on its own, 0.5 waits for the owner, and 2 is refused. When an action waits, the owner gets a World App push. In our World mini app they see the exact action, sign Approve with their World App wallet, and then complete a fresh World ID for Agents check. Our backend validates World's token before anything runs. If the owner denies, the approval expires, the check fails, or the action changed, nothing executes.

Agent swaps that stay inside the rules settle on Uniswap. Live product swaps are a single SwapRouter02 exactInputSingle of Circle USDC to WETH on Sepolia. The Uniswap contribution is LatchGateHook, a v4 beforeSwap hook that refuses any swap without a single-use permit bound to one approved action. It is deployed on Sepolia with its own pool. A permitted swap emits LatchedSwap. The same swap with no permit reverts. The hook is the on-chain half of the same gate: the pool itself refuses a swap the protocol did not authorize.

For x402 payments, we get the seller's 402 quote and screen the payee with Intercepta before signing anything. A risky payee is blocked, and Intercepta's reasons show in the audit log. A clean payee is paid with an EIP-3009 authorization that our own x402 facilitator settles on Sepolia. After a human approval, we quote and screen again, in case the seller changed its payee.

Agents connect through an MCP server, so Claude can browse a merchant catalog, pay for resources, and request swaps, all within the owner's rules. Everything runs live on Ethereum Sepolia, and the owner side runs in World App.
```

## How it's made

```text
This is a Bun + TypeScript monorepo. The API is Elysia, hosted on Render, with Postgres on Neon through Drizzle; migrations apply on startup. The dashboard and the World mini app are one React + Vite app on Vercel, which calls the API through a typed Eden client and an /api rewrite. Agents connect through a stdio MCP server with tools like list_merchants, quote_resource, pay_resource, request_swap, and wait_for_approval. Each agent authenticates with an alk_ key that we store only as a SHA-256 hash. An agent that registers a signing address must also sign every request with EIP-191 and a nonce. The policy engine, executors, and signers are separate packages. The policy engine knows nothing about sponsors, and only the executor holds a key.

ENSv2 on Sepolia (viem with hand-written ABIs): for each owner we deploy a UserRegistry proxy under agent-latch.eth. We register each agent label in it with Enhanced Access Control role bitmaps, deploy a Permissioned Resolver per agent, and write the agent's ETH address and policy text records. The spending decision is read from ENS at request time, so ENS is the source of truth, not decoration. Registration takes about 80 seconds on Sepolia, so it runs as a background job with REGISTERING and FAILED states shown in the UI.

World: the owner signs in with MiniKit walletAuth (SIWE). A desktop signs in by showing a QR code that the phone confirms. Approvals arrive as World App notifications. Approving takes a wallet signature bound to that one approval, then an RFC 8628 device authorization against World ID for Agents using our confidential client. The API polls the token endpoint and verifies the ID token against World's JWKS. It checks iss, aud, exp, and acr (orb), and requires auth_time to be after the check started. Then, under a Postgres row lock, it rechecks the approval, the owner, the action, and the ENS name before executing. The client secret, the device code, and World's sub never leave the backend.

Uniswap: LatchGateHook is a v4 beforeSwap hook built from the official v4-template. A permit binds one action id, the pool, the direction, the exact amountSpecified, a humanApproved flag, and a deadline, and the latch key signs it (EIP-191). The hook checks that signature, marks the action id used, and emits LatchedSwap. Six Foundry tests pass. It is deployed on Sepolia at 0x9A3b22908730Fda371E546d9C7ED30e063E28080, on its own USDC/WETH pool. A permitted 0.1 USDC swap landed; the same swap with no permit reverts PermitMissing(). Live agent SWAP still goes through v3: one SwapRouter02 exactInputSingle (USDC to WETH, 0.01% pool), a 95% QuoterV2 floor, and an exact-amount approve. The agent supplies only the amount. Wiring the hook into the executor is the next settlement step: the same allow-or-World-approve decision, then a signed permit as hookData through the Universal Router.

x402 + Intercepta: we implemented both the x402 v2 seller and the facilitator (/facilitator/verify and /facilitator/settle), using EIP-3009 transferWithAuthorization on Circle's Sepolia USDC. Before the executor signs, the API sends the quote's payTo to Intercepta's quick scan. Any toxic score or risk trait blocks the payment, and the reasons go into the audit log. A payment approved by a human is quoted and screened again before it settles.

Hacky parts: we dropped World's browser authorization-code flow after about 5.5 hours, because the sandbox auto-approved inside the browser that started the request, and moved to the device grant. The mocked sandbox identities mint a new sub on every proof, so we bind the human to their World App wallet instead of their sub. Approvals last 5 minutes and device codes 20, so the approval always expires first and a late proof is discarded. The hook hit "stack too deep" under the template's default via_ir=false settings, so we split decode and recover into helpers. The public Sepolia RPC rate-limits ENS reads, so the demo uses a keyed RPC, and a ping every 5 minutes keeps the free Render instance awake.
```

## How AI tools were used

```text
We used AI in two ways: as coding assistants while building, and as the agents the product itself controls.

Building: we wrote most of the code with AI coding agents in Cursor, Claude Code, and Codex. We made the architecture and product decisions ourselves: the three answers of allow, block, or ask a human; keeping policy, executors, and signers in separate packages; keeping sponsors out of the policy engine; and never letting the agent hold a key. The Uniswap v4 hook, LatchGateHook, was written the same way: we designed the single-use permit and the rule that the hook checks the latch signature, not the human, then used agents to implement the Foundry tests and the Sepolia deploy script.

To keep several agents on the same page over the weekend, the repo has one agent entry point (AGENTS.md; CLAUDE.md only points to it) and a docs/agent folder. That folder holds current-state.md (what is built and how it was tested), decisions.md (dated choices agents must not reopen), open-questions.md (things agents must not decide on their own), and a step-by-step continuation plan. Every change had to update current-state.md in the same commit, so the next agent or teammate could pick up from git alone.

We checked the agents' work against live systems, not just in the editor. Every integration was run for real: ENSv2 registrations read back on Sepolia, World ID approvals against the live sandbox and on a phone, Intercepta scans with real mainnet addresses, x402 settlements, a Uniswap v3 swap, and a v4 permitted swap through LatchGateHook, with their Etherscan hashes recorded. AI-written code was not called done until a real run passed.

MCP tools helped with the sponsor integrations. World's sandbox MCP tool get_idp_guide is where we found the actual World ID for Agents integration guides (OIDC and step-up), which led us to the device-grant flow. We used the World Developer Portal MCP to configure the mini app, and an ENS MCP for name lookups (it reads mainnet only, so we checked our Sepolia names with our own viem reads).

In the product: the agents this protocol governs are AI agents. apps/mcp is a stdio MCP server that Claude or Cursor connects to with a per-agent key. Its tools let the agent browse x402 merchants, quote and pay for resources, request Uniswap swaps, and wait for an owner's approval. The model never gets a private key or builds a transaction. It can only ask, and the policy on its ENS name, Intercepta, and a World ID-verified human decide what happens. The protocol does not call an LLM itself.
```

## Links for the form

- Demo: https://www.dsapprotocol.xyz
- Repo: https://github.com/prathamesh-mutkure/agent-latch
- World debrief: [`docs/world-id-debrief.md`](world-id-debrief.md)
- Uniswap feedback: [`FEEDBACK.md`](../FEEDBACK.md)
- Uniswap form: https://developers.uniswap.org/hackathon-feedback (submit with the FEEDBACK.md URL)
- v4 hook: [`contracts/latch-hook/src/LatchGateHook.sol`](../contracts/latch-hook/src/LatchGateHook.sol)
- v4 permitted swap: https://sepolia.etherscan.io/tx/0x77550a59ef2836cbe1b6b39e0561b6e338d819a03b80524936bf8d809712b99a
