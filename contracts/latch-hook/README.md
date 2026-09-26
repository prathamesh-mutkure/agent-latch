# LatchGateHook

A Uniswap v4 `beforeSwap` hook that refuses any swap without a single-use AgentLatch permit. What it checks, where it is deployed, and the Sepolia transactions are in the root [README](../../README.md#v4-hook-latchgatehook).

- Hook: `src/LatchGateHook.sol`
- Tests: `test/LatchGateHook.t.sol` (`forge test`)
- Sepolia run: `script/LatchDemo.s.sol` reads `EXECUTOR_PRIVATE_KEY` from the environment

Built from [uniswapfoundation/v4-template](https://github.com/uniswapfoundation/v4-template) (MIT, see `LICENSE`). `lib/` is not committed. Copy it from a recursive clone of that template.
