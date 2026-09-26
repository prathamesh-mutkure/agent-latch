// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";

import {EasyPosm} from "./utils/libraries/EasyPosm.sol";

import {LatchGateHook} from "../src/LatchGateHook.sol";
import {BaseTest} from "./utils/BaseTest.sol";

contract LatchGateHookTest is BaseTest {
    using EasyPosm for IPositionManager;
    using PoolIdLibrary for PoolKey;

    Currency currency0;
    Currency currency1;
    PoolKey poolKey;
    PoolId poolId;
    LatchGateHook hook;

    address latch;
    uint256 latchKey;

    uint256 constant AMOUNT_IN = 1e18;

    event LatchedSwap(bytes32 indexed actionId, PoolId indexed poolId, bool humanApproved, int256 amountSpecified);

    function setUp() public {
        deployArtifactsAndLabel();
        (currency0, currency1) = deployCurrencyPair();
        (latch, latchKey) = makeAddrAndKey("latch");

        address flags = address(uint160(Hooks.BEFORE_SWAP_FLAG) ^ (0x4444 << 144));
        deployCodeTo("LatchGateHook.sol:LatchGateHook", abi.encode(poolManager, latch), flags);
        hook = LatchGateHook(flags);

        poolKey = PoolKey(currency0, currency1, 3000, 60, IHooks(hook));
        poolId = poolKey.toId();
        poolManager.initialize(poolKey, Constants.SQRT_PRICE_1_1);

        int24 tickLower = TickMath.minUsableTick(poolKey.tickSpacing);
        int24 tickUpper = TickMath.maxUsableTick(poolKey.tickSpacing);
        uint128 liquidityAmount = 100e18;
        (uint256 amount0, uint256 amount1) = LiquidityAmounts.getAmountsForLiquidity(
            Constants.SQRT_PRICE_1_1,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            liquidityAmount
        );
        positionManager.mint(
            poolKey,
            tickLower,
            tickUpper,
            liquidityAmount,
            amount0 + 1,
            amount1 + 1,
            address(this),
            block.timestamp,
            Constants.ZERO_BYTES
        );
    }

    function permit(uint256 signerKey, bytes32 actionId, int256 amountSpecified, bool humanApproved, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = hook.permitDigest(actionId, poolId, true, amountSpecified, humanApproved, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, MessageHashUtils.toEthSignedMessageHash(digest));
        return abi.encode(actionId, humanApproved, deadline, abi.encodePacked(r, s, v));
    }

    function swap(uint256 amountIn, bytes memory hookData) internal returns (BalanceDelta) {
        return swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: hookData,
            receiver: address(this),
            deadline: block.timestamp + 1
        });
    }

    function test_swapWithPermit() public {
        bytes32 actionId = keccak256("action-1");
        bytes memory hookData = permit(latchKey, actionId, -int256(AMOUNT_IN), true, block.timestamp + 300);

        vm.expectEmit(true, true, false, true, address(hook));
        emit LatchedSwap(actionId, poolId, true, -int256(AMOUNT_IN));
        BalanceDelta delta = swap(AMOUNT_IN, hookData);

        assertEq(int256(delta.amount0()), -int256(AMOUNT_IN));
        assertGt(delta.amount1(), 0);
        assertTrue(hook.used(actionId));
    }

    function test_revertWithoutPermit() public {
        vm.expectRevert();
        swap(AMOUNT_IN, Constants.ZERO_BYTES);
    }

    function test_revertWrongSigner() public {
        (, uint256 otherKey) = makeAddrAndKey("other");
        bytes memory hookData = permit(otherKey, keccak256("action-2"), -int256(AMOUNT_IN), false, block.timestamp + 300);
        vm.expectRevert();
        swap(AMOUNT_IN, hookData);
    }

    function test_revertReusedPermit() public {
        bytes memory hookData = permit(latchKey, keccak256("action-3"), -int256(AMOUNT_IN), false, block.timestamp + 300);
        swap(AMOUNT_IN, hookData);
        vm.expectRevert();
        swap(AMOUNT_IN, hookData);
    }

    function test_revertWrongAmount() public {
        bytes memory hookData = permit(latchKey, keccak256("action-4"), -int256(AMOUNT_IN), false, block.timestamp + 300);
        vm.expectRevert();
        swap(AMOUNT_IN * 2, hookData);
    }

    function test_revertExpiredPermit() public {
        bytes memory hookData = permit(latchKey, keccak256("action-5"), -int256(AMOUNT_IN), true, block.timestamp + 300);
        vm.warp(block.timestamp + 301);
        vm.expectRevert();
        swap(AMOUNT_IN, hookData);
    }
}
