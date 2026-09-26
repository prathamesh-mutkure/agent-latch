# AgentLatch: Delegated Spend Authorization Protocol

AI agents spend inside rules published on their ENS name. Anything past those rules waits for the owner to approve in World App with a fresh World ID for Agents check. Built at ETHGlobal Tokyo 2026 on Ethereum Sepolia.

- Live demo: [www.dsapprotocol.xyz](https://www.dsapprotocol.xyz). Approvals are decided inside World App. On a computer, the approval page shows a QR code that opens it there.
- API: [dsap-protocol.onrender.com/health](https://dsap-protocol.onrender.com/health)
- ETHGlobal Tokyo prizes: World ID for Agents, Best Use of ENSv2, Best Uniswap Stack Contribution. Submission copy: [`docs/ethglobal-submission.md`](docs/ethglobal-submission.md)
- Uniswap v4 hook: [`contracts/latch-hook`](contracts/latch-hook), details in [Uniswap integration](#uniswap-integration)

## How it works

An agent never holds a key and never builds a transaction. Through the MCP server ([`apps/mcp`](apps/mcp/src/index.ts)) it asks to pay for an x402 resource, swap USDC for WETH on Uniswap, or send USDC. Each request gets one of three answers. Under the demo policy (0.2 USDC autonomous, 1 hard limit, 5 daily):

- 0.2 USDC runs at once.
- 0.5 waits for the owner.
- 2 is blocked, and nothing is signed.

1. The API reads the agent's ENS name. A missing or expired name, or a name with no published policy, blocks the action.
2. [`evaluatePolicy`](packages/core/src/policy.ts) compares the amount, action, token, and target with the policy on the name and with today's spend.
3. For an x402 payment, Intercepta screens the seller's payee before anything is signed. A risky payee blocks the payment.
4. An action that needs a human opens a 5-minute approval and pushes it to the owner in World App. The owner signs Approve with their World App wallet, then completes a World ID for Agents check. The API validates World's token before anything runs. A deny, a timeout, a failed check, or a changed action runs nothing.
5. The executor key signs and broadcasts. The action is marked `EXECUTED` only after the transaction lands. Every step is in the audit log (`GET /agents/:id/audit`).

## Sponsor integrations

### ENSv2 on Sepolia

Each agent is an ENSv2 name, like `scout.latchtest.agent-latch.eth`. Its spending rules are text records on that name, and the API reads them on every decision.

- [`registerUnderParent`](packages/integrations/ens/src/namespace.ts) deploys a UserRegistry (Permissioned Registry) for each owner under `agent-latch.eth`, then registers the agent label in it with Enhanced Access Control role bitmaps ([`registryRoles`](packages/integrations/ens/src/config.ts)).
- [`resolver.ts`](packages/integrations/ens/src/resolver.ts) deploys a Permissioned Resolver for each agent and writes its ETH address and the policy text records: `policy.autonomousLimit`, `policy.hardLimit`, `policy.dailyLimit`, `policy.actions`, `policy.tokens`, `policy.targets` ([`policyTextKeys`](packages/integrations/ens/src/sdk.ts)).
- [`submitAction`](apps/api/src/modules/actions/service.ts) blocks an agent whose name is missing, expired, or unpublished, and decides from the policy on the name.
- Tightening a limit in the dashboard writes the name at once. A looser edit is refused until the owner can sign it ([`apps/api/src/modules/agents/service.ts`](apps/api/src/modules/agents/service.ts)).

### World ID for Agents

World is the human boundary. It is not a login screen: it gates the one action that went past the rules.

- [`world-id.ts`](packages/integrations/world/src/world-id.ts): an RFC 8628 device authorization with our confidential client. `checkIdToken` requires the orb `acr` and an `auth_time` after the check started. The ID token's signature, `iss`, `aud`, and `exp` are checked by `openid-client`.
- [`approvals/service.ts`](apps/api/src/modules/approvals/service.ts): `decideInWorldApp` checks the owner's wallet signature for this one approval and starts the check. `settleWorldIdCheck` and `runVerified` recheck the approval, the owner, the action, and the ENS name under a row lock, then execute.
- [`apps/web/src/pages/approve.tsx`](apps/web/src/pages/approve.tsx) and [`mini.tsx`](apps/web/src/pages/mini.tsx): the World mini app, with MiniKit `walletAuth` and notifications ([`packages/integrations/world/src/index.ts`](packages/integrations/world/src/index.ts)).
- Integration debrief: [`docs/world-id-debrief.md`](docs/world-id-debrief.md).

### Uniswap

The Uniswap contribution is [`LatchGateHook`](#v4-hook-latchgatehook), a v4 `beforeSwap` hook that refuses any swap without a single-use AgentLatch permit. It is deployed on Sepolia. Live agent swaps still settle through a v3 `exactInputSingle` until the executor wires that permit into the product path. See [Uniswap integration](#uniswap-integration) and [FEEDBACK.md](FEEDBACK.md).

### Intercepta

[`screenPayment`](packages/integrations/intercepta/src/index.ts) calls Intercepta's quick scan on the payee of an x402 quote. [`submitAction`](apps/api/src/modules/actions/service.ts) and [`settleAuthorizedPayment`](apps/api/src/payments.ts) run it before the executor signs. The second call runs again after a human approval, because the seller may have changed its payee. Any toxic score or risk trait blocks the payment, and the reasons go into the audit log.

### x402

The API is the paying agent, and it also runs an x402 v2 seller and facilitator ([`apps/api/src/modules/x402`](apps/api/src/modules/x402), [`apps/api/src/modules/facilitator`](apps/api/src/modules/facilitator)). Payments are EIP-3009 `transferWithAuthorization` on Circle's Sepolia USDC.

## Docs

Product direction lives in [`docs/agent/planning.md`](docs/agent/planning.md). What is actually built, and which choices are closed, lives next to it. Coding agents start at [`AGENTS.md`](AGENTS.md). Claude Code loads [`CLAUDE.md`](CLAUDE.md), which points at that same file.

## Run

```sh
bun install
cp .env.example .env
bun run infra:up
bun run dev
```

The API applies database migrations on startup. More commands, including how to run the agent alone, are in [`docs/agent/commands.md`](docs/agent/commands.md).

- Web: http://localhost:5173
- API health: http://localhost:3001/health
- Agent: background process started by `bun run dev`

The API stores agents, policies, actions, approvals, and an audit log in Postgres. `POST /agents/:id/actions` returns allow, block, or an approval id. An approval pushes to the agent's owner in World App. The owner denies with a wallet signature bound to that one action. To approve, they sign and then complete a fresh World ID for Agents check. The API validates World's token before the action runs. The integration debrief is [`docs/world-id-debrief.md`](docs/world-id-debrief.md). The timeline is `GET /agents/:id/audit`. Field details are in `docs/agent/current-state.md`. The World App setup is in [`docs/agent/commands.md`](docs/agent/commands.md).

```sh
bun run typecheck
bun run lint
```

## Layout

Runnable apps are `apps/web` (dashboard and World mini app), `apps/api`, `apps/agent` (background agent), and `apps/mcp` (stdio MCP server for Claude or Cursor). `@agentlatch/core` holds the policy engine. Sponsor clients live in `packages/integrations/*`, the executors in `packages/executors/*`, and the v4 hook in `contracts/latch-hook`. Later modules are directories with `.gitkeep` only.

## Uniswap integration

The prize contribution is a Uniswap v4 hook. The product's live swaps still use v3 because that is where Sepolia USDC/WETH liquidity lives.

- [`LatchGateHook`](#v4-hook-latchgatehook): a `beforeSwap` hook. A pool behind it refuses any swap that does not carry a single-use permit AgentLatch signed for one approved action, so the pool enforces the agent's authorization itself. Deployed on Sepolia, 6 Foundry tests, one permitted swap on chain.
- [v3 swap path](#v3-swap-path): every live agent `SWAP` today. One `exactInputSingle` on SwapRouter02 after the ENS policy allows it, or after a World ID approval.

### v4 hook: `LatchGateHook`

[`contracts/latch-hook`](contracts/latch-hook) is a Uniswap v4 `beforeSwap` hook that refuses any swap without a single-use AgentLatch permit. A permit binds one action id, the pool, the direction, the exact `amountSpecified`, a `humanApproved` flag, and a deadline, and the latch key signs it (EIP-191). The hook checks the latch signature, not the human. The owner's World App wallet lives on World Chain and the World ID for Agents result is validated by the API, so neither can be verified on Sepolia. `humanApproved` is what the latch signer asserts. Spending limits stay in the policy engine, not in the hook. The hook is deployed and exercised by a Foundry script. The product's `SWAP` still runs through the [v3 path](#v3-swap-path). In this deployment the latch signer is the executor key.

Contracts (Ethereum Sepolia):

- LatchGateHook: [`0x9A3b22908730Fda371E546d9C7ED30e063E28080`](https://sepolia.etherscan.io/address/0x9A3b22908730Fda371E546d9C7ED30e063E28080). Its address carries only the `beforeSwap` flag.
- v4 PoolManager: [`0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`](https://sepolia.etherscan.io/address/0xE03A1074c86CFeDd5C142C4F04F1a1536e203543)
- Pool id `0x2afce9bde9e4e880fa35b55ac54b95b9596d6bdc7faccbd3689a9fdfcf3b403b`: USDC/WETH, fee 3000, tick spacing 60, behind the hook, seeded with 1 USDC of our own liquidity.
- Routers used: PoolModifyLiquidityTest [`0x0C478023803a644c94c4CE1C1e7b9A087e411B0A`](https://sepolia.etherscan.io/address/0x0C478023803a644c94c4CE1C1e7b9A087e411B0A) and PoolSwapTest [`0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe`](https://sepolia.etherscan.io/address/0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe).

Code (pinned to `e47db3c`):

- [Hook permissions: `beforeSwap` only](https://github.com/prathamesh-mutkure/agent-latch/blob/e47db3cb5393110021702fe34140be8681c5e716/contracts/latch-hook/src/LatchGateHook.sol#L37-L54)
- [`permitDigest`, what the latch key signs](https://github.com/prathamesh-mutkure/agent-latch/blob/e47db3cb5393110021702fe34140be8681c5e716/contracts/latch-hook/src/LatchGateHook.sol#L56-L70)
- [`_beforeSwap`: check the permit, mark it used, emit `LatchedSwap`](https://github.com/prathamesh-mutkure/agent-latch/blob/e47db3cb5393110021702fe34140be8681c5e716/contracts/latch-hook/src/LatchGateHook.sol#L72-L83)
- [`_checkPermit`: missing, expired, reused, or wrongly signed permits revert](https://github.com/prathamesh-mutkure/agent-latch/blob/e47db3cb5393110021702fe34140be8681c5e716/contracts/latch-hook/src/LatchGateHook.sol#L85-L105)
- [Tests](https://github.com/prathamesh-mutkure/agent-latch/blob/e47db3cb5393110021702fe34140be8681c5e716/contracts/latch-hook/test/LatchGateHook.t.sol): a valid permit swaps and emits `LatchedSwap`. A missing permit, a wrong signer, a reused permit, a wrong amount, and an expired permit each revert. 6 of 6 pass with `forge test`.
- [Sepolia script](https://github.com/prathamesh-mutkure/agent-latch/blob/e47db3cb5393110021702fe34140be8681c5e716/contracts/latch-hook/script/LatchDemo.s.sol): mines the hook address, deploys it, opens and seeds the pool, and swaps 0.1 USDC with a permit.

Proof:

- [Hook deploy](https://sepolia.etherscan.io/tx/0x1d031bc6acef5b6433a70d41b778ad7d8e80c5328461992203f37bd91a1790af), [pool initialize](https://sepolia.etherscan.io/tx/0x1bc677474b1cd920defc050ce6847f4f5a2eb4ed374845d9732e65cc05446a87), [liquidity](https://sepolia.etherscan.io/tx/0x9dccff47dbe406dc3f82b6b02c42b39604e0cfa6e4e2b8844891120d3dcb2a3b).
- [Swap with a permit](https://sepolia.etherscan.io/tx/0x77550a59ef2836cbe1b6b39e0561b6e338d819a03b80524936bf8d809712b99a). In its logs, the hook emits `LatchedSwap` with action id `dsap-hook-demo-1` (bytes32), the pool id above, `humanApproved` false, and `amountSpecified` -100000. The PoolManager emits `Swap` for the same pool id. 0.1 USDC goes in, and WETH goes to the executor.
- The same swap without a permit is refused. This read-only call returns `WrappedError(hook, 0x575e24b4 beforeSwap, 0xd79680ff PermitMissing(), 0xa9e35b2f HookCallFailed())`:

```sh
cast call 0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe \
  "swap((address,address,uint24,int24,address),(bool,int256,uint160),(bool,bool),bytes)" \
  "(0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238,0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14,3000,60,0x9A3b22908730Fda371E546d9C7ED30e063E28080)" \
  "(true,-100000,4295128740)" "(false,false)" 0x \
  --from 0x142B99367b928608835501633534411EFc467737 --rpc-url https://ethereum-sepolia-rpc.publicnode.com
```

Build the hook: the Solidity dependencies come from [uniswapfoundation/v4-template](https://github.com/uniswapfoundation/v4-template) and are not committed. Run `git clone --depth 1 --recurse-submodules --shallow-submodules https://github.com/uniswapfoundation/v4-template /tmp/v4t && cp -R /tmp/v4t/lib contracts/latch-hook/lib`, then `forge test` inside `contracts/latch-hook`.

### v3 swap path

Every agent swap is one Uniswap V3 `exactInputSingle` on SwapRouter02 on Ethereum Sepolia, with Circle USDC in and WETH out through the 0.01% pool (fee 100). The minimum output is 95% of a QuoterV2 quote taken just before the swap. The router is approved for the exact swap amount only when the allowance is short, and WETH goes to the executor address. The swap runs only after the agent's ENS policy (text records on its ENS name) allows it, or after the owner approves in World App with a World ID for Agents check. Under the demo policy (0.2 autonomous, 1 hard, 5 daily USDC), a 0.2 USDC swap runs immediately, 0.5 waits for the human, and 2 never trades. The agent's only swap input is an amount and a note through the MCP tool `request_swap`. It cannot choose the router, pool, fee, output token, or calldata. The action is marked executed only after the transaction lands.

Contracts (Ethereum Sepolia):

- SwapRouter02: [`0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E`](https://sepolia.etherscan.io/address/0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E)
- QuoterV2: [`0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3`](https://sepolia.etherscan.io/address/0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3)
- USDC/WETH 0.01% pool: [`0xfeed501c2b21d315f04946f85fc6416b640240b5`](https://sepolia.etherscan.io/address/0xfeed501c2b21d315f04946f85fc6416b640240b5)
- USDC: [`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`](https://sepolia.etherscan.io/address/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238)
- WETH: [`0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`](https://sepolia.etherscan.io/address/0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14)
- Executor: [`0x142B99367b928608835501633534411EFc467737`](https://sepolia.etherscan.io/address/0x142B99367b928608835501633534411EFc467737)

Code:

- [Router, output token, fee, quoter, and 95% minimum constants](https://github.com/prathamesh-mutkure/agent-latch/blob/aefb051a24916f723d6efa167ae48eb473ccb677/packages/executors/uniswap/src/index.ts#L12-L28)
- [`swapUsdcToWeth`](https://github.com/prathamesh-mutkure/agent-latch/blob/aefb051a24916f723d6efa167ae48eb473ccb677/packages/executors/uniswap/src/index.ts#L110-L177)
- [QuoterV2 `quoteExactInputSingle` and the minimum output](https://github.com/prathamesh-mutkure/agent-latch/blob/aefb051a24916f723d6efa167ae48eb473ccb677/packages/executors/uniswap/src/index.ts#L122-L141)
- [Exact-amount approve only when the allowance is short](https://github.com/prathamesh-mutkure/agent-latch/blob/aefb051a24916f723d6efa167ae48eb473ccb677/packages/executors/uniswap/src/index.ts#L143-L156)
- [`exactInputSingle` on SwapRouter02](https://github.com/prathamesh-mutkure/agent-latch/blob/aefb051a24916f723d6efa167ae48eb473ccb677/packages/executors/uniswap/src/index.ts#L158-L176)
- [SWAP accepts only USDC in and WETH out](https://github.com/prathamesh-mutkure/agent-latch/blob/aefb051a24916f723d6efa167ae48eb473ccb677/apps/api/src/broadcast.ts#L50-L72)
- [The swap call](https://github.com/prathamesh-mutkure/agent-latch/blob/aefb051a24916f723d6efa167ae48eb473ccb677/apps/api/src/broadcast.ts#L108-L116)
- [ENS name gate and policy decision before any swap](https://github.com/prathamesh-mutkure/agent-latch/blob/aefb051a24916f723d6efa167ae48eb473ccb677/apps/api/src/modules/actions/service.ts#L96-L136)
- [Broadcast only on ALLOW](https://github.com/prathamesh-mutkure/agent-latch/blob/aefb051a24916f723d6efa167ae48eb473ccb677/apps/api/src/modules/actions/service.ts#L176-L194)
- [Above the hard limit blocks, above the autonomous limit asks a human](https://github.com/prathamesh-mutkure/agent-latch/blob/aefb051a24916f723d6efa167ae48eb473ccb677/packages/core/src/policy.ts#L61-L89)
- [Swap after a verified World ID approval, marked EXECUTED only after it lands](https://github.com/prathamesh-mutkure/agent-latch/blob/aefb051a24916f723d6efa167ae48eb473ccb677/apps/api/src/modules/approvals/service.ts#L772-L807)
- [`request_swap`, the agent's only swap input](https://github.com/prathamesh-mutkure/agent-latch/blob/aefb051a24916f723d6efa167ae48eb473ccb677/apps/mcp/src/index.ts#L170-L188)

Proof: [allow-path swap of 0.15 USDC](https://sepolia.etherscan.io/tx/0x2bb7dd3884f3da9dc12fe67cb44d8b47721403839c165fe4685ad8117685f93b), status success in block 11788839. Check that its `to` is SwapRouter02, that its input starts with `0x04e45aaf` (`exactInputSingle`), and that the pool `0xfeed...40b5` emits the Swap event and sends WETH to the executor.

### How v3 and v4 fit together

Today every agent `SWAP` settles on v3. The v4 hook is the on-chain half of the same gate and plugs into the same settlement step.

1. The agent calls `request_swap` with an amount and a note.
2. AgentLatch reads the agent's ENS policy. It allows the swap, sends it to the owner's World App (wallet signature plus World ID for Agents), or blocks it, and on a block nothing is signed.
3. On allow, or once World ID verifies the owner, the executor settles the swap:
   - v3, live: a QuoterV2 quote, a 95% minimum, and `exactInputSingle` on SwapRouter02.
   - v4, next: AgentLatch signs a permit for that one action. The permit's action id is the keccak256 of the AgentLatch action id, `humanApproved` is true only when World ID verified the owner, and the deadline is short. The swap carries the permit as `hookData` into the `LatchGateHook` pool. The hook checks it, marks it used, and emits `LatchedSwap`, so each on-chain swap maps to one entry in AgentLatch's audit log.

Connecting v4 changes only the settlement step:

- `packages/executors/uniswap` gains a v4 path. It reads `permitDigest` from the hook and signs it with viem `signMessage({ message: { raw } })`. It quotes with the v4 Quoter [`0x61b3f2011a92d183c7dbadbda940a7555ccf9227`](https://sepolia.etherscan.io/address/0x61b3f2011a92d183c7dbadbda940a7555ccf9227) and swaps through the Universal Router instead of the test routers.
- `apps/api/src/broadcast.ts` passes the action id, and whether a World ID approval settled it, into that path.
- The hook's pool needs real liquidity. Today it holds 1 USDC.
- Whether a separate latch key signs permits, instead of the executor key, is part of the open signer custody question.

These stay the same: the policy engine, the World approval, the agent's input (an amount and a note, no calldata), and marking the action executed only after the transaction lands.

v3 is where the Sepolia USDC/WETH liquidity is today. v4 lets the pool itself refuse a swap AgentLatch did not authorize, so the gate holds even when someone calls the pool directly.

Uniswap feedback: [FEEDBACK.md](FEEDBACK.md).

## Team handoff

Before starting work, read `docs/agent/current-state.md`. Before handing off, update that file in the same change. Settled choices go in `docs/agent/decisions.md`.

## License

MIT. See [LICENSE](LICENSE).
