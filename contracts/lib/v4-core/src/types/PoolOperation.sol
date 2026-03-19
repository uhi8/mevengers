// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

struct SwapParams {
    /// Whether to swap token0 for token1 or vice versa
    bool zeroForOne;
    /// The desired input amount if negative (exactIn), or the desired output amount if positive (exactOut)
    int256 amountSpecified;
    /// The sqrt price at which, if reached, the swap will stop executing
    uint160 sqrtPriceLimitX96;
}

struct ModifyLiquidityParams {
    /// The lower tick of the position
    int24 tickLower;
    /// The upper tick of the position
    int24 tickUpper;
    /// The amount of liquidity to modify
    int256 liquidityDelta;
    /// The salt for the position
    bytes32 salt;
}
