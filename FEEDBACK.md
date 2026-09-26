# Uniswap developer feedback: AgentLatch (Delegated Spend Authorization Protocol), ETHGlobal Tokyo 2026

## What we built

AgentLatch (shown in the UI as Delegated Spend Authorization Protocol) lets an AI agent request a swap, but the agent never signs or builds the transaction. The Uniswap stack contribution is `LatchGateHook`, a v4 `beforeSwap` hook that refuses any swap without a single-use permit AgentLatch signed for one approved action. The hook is deployed on Sepolia with its own USDC/WETH pool. Live agent swaps still settle through a Uniswap V3 `exactInputSingle` on SwapRouter02 until the executor wires that permit into the product path. Either path runs only after the agent's ENS policy allows it or the owner approves in World App with a World ID for Agents check. Details are in the [README](README.md#uniswap-integration).

## Uniswap surface used

### v4 hook (prize contribution)

- `LatchGateHook` at [`0x9A3b22908730Fda371E546d9C7ED30e063E28080`](https://sepolia.etherscan.io/address/0x9A3b22908730Fda371E546d9C7ED30e063E28080) on Ethereum Sepolia (chain 11155111). The address carries only the `beforeSwap` flag.
- v4 PoolManager [`0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`](https://sepolia.etherscan.io/address/0xE03A1074c86CFeDd5C142C4F04F1a1536e203543).
- Own USDC/WETH pool, fee 3000, tick spacing 60, pool id `0x2afce9bde9e4e880fa35b55ac54b95b9596d6bdc7faccbd3689a9fdfcf3b403b`, seeded with 1 USDC.
- Built from [uniswapfoundation/v4-template](https://github.com/uniswapfoundation/v4-template). Tests use `BaseTest` and `deployCodeTo`. The Sepolia demo uses PoolSwapTest and PoolModifyLiquidityTest so `hookData` can carry the permit without PositionManager or Permit2.

### v3 product path

- SwapRouter02 `exactInputSingle` on Ethereum Sepolia, Circle USDC in, WETH out, 0.01% pool (fee 100).
- QuoterV2 `quoteExactInputSingle`, taken just before the swap. The minimum output is 95% of that quote. We use no price oracle.
- The USDC/WETH 0.01% pool at `0xfeed501c2b21d315f04946f85fc6416b640240b5`.
- No Uniswap SDK. The executor uses viem ^2.47 with hand-written ABI fragments, on Bun 1.3.8 with TypeScript and an Elysia API.

## What worked

- A pool behind `LatchGateHook` refuses a swap that does not carry a single-use permit. The permit binds one action id, the pool, the direction, the exact `amountSpecified`, a `humanApproved` flag, and a deadline. The hook checks the latch signature, not the human. Six Foundry tests pass: a valid permit swaps and emits `LatchedSwap`; a missing permit, a wrong signer, a reused permit, a wrong amount, and an expired permit each revert.
- The v4-template got us to a passing hook test fast. `HookMiner.find` with the canonical CREATE2 deployer worked the first time.
- One permitted 0.1 USDC swap landed on Sepolia: [proof tx](https://sepolia.etherscan.io/tx/0x77550a59ef2836cbe1b6b39e0561b6e338d819a03b80524936bf8d809712b99a). The hook emits `LatchedSwap` and the PoolManager emits `Swap`. The same swap with no permit reverts `PermitMissing()`.
- On the v3 path, one `exactInputSingle` covers the whole swap. The agent's only swap input is an amount and a note. QuoterV2 gave a usable minimum output. The router is approved for the exact swap amount only when the allowance is short. Allow-path swap: [proof tx](https://sepolia.etherscan.io/tx/0x2bb7dd3884f3da9dc12fe67cb44d8b47721403839c165fe4685ad8117685f93b).

## What slowed us down

- With the template's default settings (`via_ir = false`, no optimizer), we hit "stack too deep" twice: once in a `beforeSwap` that decodes hookData and recovers a signature, and once in the deploy script. We split both into helper functions.
- A hook revert surfaces as `WrappedError(hook, selector, reason, details)`. Decoding it back to `PermitMissing()` took a step.
- Finding which Sepolia USDC/WETH fee tier had usable liquidity meant probing the factory. The 0.01% tier gave the best quote on v3. The hook pool holds only the 1 USDC we seeded.
- QuoterV2 quote functions are nonpayable, so a quote is an `eth_call` through viem `simulateContract`, not a view `readContract`.
- The SwapRouter02 `exactInputSingle` struct differs from the original SwapRouter because it has no deadline field. We wrote the ABI fragment by hand.
- The public Sepolia RPC rate-limits, so a demo needs a keyed RPC.

## Docs gaps

- We would like one canonical Sepolia table with every Uniswap contract address, plus which pools have liquidity.
- A note in the v4-template, or `via_ir` on by default, would have avoided the stack-too-deep splits.
- The docs mostly show the PositionManager flow. For a testnet hook demo, PoolSwapTest and PoolModifyLiquidityTest were faster, and a short example would have helped.
- A short docs example that maps `WrappedError` back to the hook's custom error would help.
- We would like a note next to `exactInputSingle` that explains how the SwapRouter and SwapRouter02 structs differ.

## Why we did not use the Trading API

The Trading API returns Universal Router calldata. AgentLatch's executor refuses to sign free-form calldata that the agent or a third party supplies, so it builds the one `exactInputSingle` call itself. Our ask is a Trading API mode that also returns a decoded, checkable intent (router, pool, tokens, minimum output), so policy-gated agents can verify it before signing. The same constraint is why the v4 path, once wired, will sign a permit and swap through the Universal Router with known `hookData`, not with opaque calldata.

## What we would build next

We would route the product's `SWAP` through `LatchGateHook`. AgentLatch would sign a permit for each allowed or World ID-approved action, and the Universal Router would carry it as `hookData`, so the pool itself refuses any swap AgentLatch did not authorize. The steps are in the [README](README.md#how-v3-and-v4-fit-together).

We would bind the Uniswap minimum output into the owner's World ID approval. The human would approve a price floor, and the swap would refuse to run if a fresh quote is below it.

## Links

- Repo: https://github.com/prathamesh-mutkure/agent-latch
- README section: [Uniswap integration](README.md#uniswap-integration)
- Hook: [LatchGateHook.sol](https://github.com/prathamesh-mutkure/agent-latch/blob/e47db3cb5393110021702fe34140be8681c5e716/contracts/latch-hook/src/LatchGateHook.sol)
- v4 permitted swap: https://sepolia.etherscan.io/tx/0x77550a59ef2836cbe1b6b39e0561b6e338d819a03b80524936bf8d809712b99a
- v3 allow-path swap: https://sepolia.etherscan.io/tx/0x2bb7dd3884f3da9dc12fe67cb44d8b47721403839c165fe4685ad8117685f93b
