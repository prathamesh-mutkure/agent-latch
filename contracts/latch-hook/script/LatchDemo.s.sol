// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager, SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";

import {LatchGateHook} from "../src/LatchGateHook.sol";

interface IWETH {
    function deposit() external payable;
}

/// @notice Ethereum Sepolia: deploys LatchGateHook, opens a USDC/WETH pool behind it,
/// seeds it, and runs one 0.1 USDC swap carrying a permit signed by the latch key.
contract LatchDemoScript is Script {
    using PoolIdLibrary for PoolKey;

    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    IPoolManager constant POOL_MANAGER = IPoolManager(0xE03A1074c86CFeDd5C142C4F04F1a1536e203543);
    PoolSwapTest constant SWAP_ROUTER = PoolSwapTest(0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe);
    PoolModifyLiquidityTest constant LIQUIDITY_ROUTER =
        PoolModifyLiquidityTest(0x0C478023803a644c94c4CE1C1e7b9A087e411B0A);
    address constant USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    address constant WETH = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;

    /// About 3.127e7 wei of WETH per USDC unit, the price of the v3 0.01% pool swap.
    int24 constant START_TICK = 172590;
    uint256 constant USDC_LIQUIDITY = 1e6;
    uint256 constant WETH_LIQUIDITY = 5e13;
    uint256 constant WETH_WRAP = 1e14;
    int256 constant SWAP_IN = -100_000;
    bytes32 constant ACTION_ID = "dsap-hook-demo-1";

    function run() external {
        uint256 pk = vm.envUint("EXECUTOR_PRIVATE_KEY");
        address latch = vm.addr(pk);
        (address hookAddress, bytes32 salt) = HookMiner.find(
            CREATE2_DEPLOYER,
            uint160(Hooks.BEFORE_SWAP_FLAG),
            type(LatchGateHook).creationCode,
            abi.encode(POOL_MANAGER, latch)
        );
        PoolKey memory key = PoolKey(Currency.wrap(USDC), Currency.wrap(WETH), 3000, 60, IHooks(hookAddress));

        vm.startBroadcast(pk);
        LatchGateHook hook = new LatchGateHook{salt: salt}(POOL_MANAGER, latch);
        require(address(hook) == hookAddress, "hook address mismatch");

        IWETH(WETH).deposit{value: WETH_WRAP}();
        IERC20(USDC).approve(address(LIQUIDITY_ROUTER), USDC_LIQUIDITY * 2);
        IERC20(WETH).approve(address(LIQUIDITY_ROUTER), WETH_WRAP);
        IERC20(USDC).approve(address(SWAP_ROUTER), uint256(-SWAP_IN));

        POOL_MANAGER.initialize(key, TickMath.getSqrtPriceAtTick(START_TICK));
        LIQUIDITY_ROUTER.modifyLiquidity(key, _fullRange(), "");
        SWAP_ROUTER.swap(
            key,
            SwapParams(true, SWAP_IN, TickMath.MIN_SQRT_PRICE + 1),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            _permit(pk, hook, key)
        );
        vm.stopBroadcast();

        console.log("hook", address(hook));
        console.log("poolId");
        console.logBytes32(PoolId.unwrap(key.toId()));
    }

    function _fullRange() internal pure returns (ModifyLiquidityParams memory) {
        int24 tickLower = TickMath.minUsableTick(60);
        int24 tickUpper = TickMath.maxUsableTick(60);
        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            TickMath.getSqrtPriceAtTick(START_TICK),
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            USDC_LIQUIDITY,
            WETH_LIQUIDITY
        );
        return ModifyLiquidityParams(tickLower, tickUpper, int256(uint256(liquidity)), bytes32(0));
    }

    function _permit(uint256 pk, LatchGateHook hook, PoolKey memory key) internal view returns (bytes memory) {
        uint256 deadline = block.timestamp + 900;
        bytes32 digest = hook.permitDigest(ACTION_ID, key.toId(), true, SWAP_IN, false, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, MessageHashUtils.toEthSignedMessageHash(digest));
        return abi.encode(ACTION_ID, false, deadline, abi.encodePacked(r, s, v));
    }
}
