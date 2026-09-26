// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager, SwapParams} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";

/// @notice Refuses every swap that does not carry a single-use AgentLatch permit.
/// AgentLatch signs a permit only after the agent's ENS policy allows the swap, or after
/// the owner approves it in World App with World ID. The hook checks the latch signature,
/// not the human: `humanApproved` is what the latch signer asserts. Spending limits stay
/// in AgentLatch's policy engine, not here.
contract LatchGateHook is BaseHook {
    using PoolIdLibrary for PoolKey;

    address public immutable latchSigner;

    mapping(bytes32 actionId => bool) public used;

    event LatchedSwap(bytes32 indexed actionId, PoolId indexed poolId, bool humanApproved, int256 amountSpecified);

    error PermitMissing();
    error PermitExpired();
    error PermitUsed();
    error PermitInvalid();

    constructor(IPoolManager _poolManager, address _latchSigner) BaseHook(_poolManager) {
        latchSigner = _latchSigner;
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: false,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: false,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    /// @notice The hash the latch signer signs with EIP-191 (`personal_sign` over these 32 bytes).
    function permitDigest(
        bytes32 actionId,
        PoolId poolId,
        bool zeroForOne,
        int256 amountSpecified,
        bool humanApproved,
        uint256 deadline
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                block.chainid, address(this), actionId, poolId, zeroForOne, amountSpecified, humanApproved, deadline
            )
        );
    }

    /// @dev hookData is abi.encode(bytes32 actionId, bool humanApproved, uint256 deadline, bytes signature).
    function _beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata hookData)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId poolId = key.toId();
        (bytes32 actionId, bool humanApproved) = _checkPermit(poolId, params, hookData);
        used[actionId] = true;
        emit LatchedSwap(actionId, poolId, humanApproved, params.amountSpecified);
        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function _checkPermit(PoolId poolId, SwapParams calldata params, bytes calldata hookData)
        internal
        view
        returns (bytes32 actionId, bool humanApproved)
    {
        if (hookData.length == 0) revert PermitMissing();
        uint256 deadline;
        bytes memory signature;
        (actionId, humanApproved, deadline, signature) = abi.decode(hookData, (bytes32, bool, uint256, bytes));
        if (block.timestamp > deadline) revert PermitExpired();
        if (used[actionId]) revert PermitUsed();
        bytes32 digest =
            permitDigest(actionId, poolId, params.zeroForOne, params.amountSpecified, humanApproved, deadline);
        if (!_signedByLatch(digest, signature)) revert PermitInvalid();
    }

    function _signedByLatch(bytes32 digest, bytes memory signature) internal view returns (bool) {
        (address signer, ECDSA.RecoverError err,) =
            ECDSA.tryRecover(MessageHashUtils.toEthSignedMessageHash(digest), signature);
        return err == ECDSA.RecoverError.NoError && signer == latchSigner;
    }
}
