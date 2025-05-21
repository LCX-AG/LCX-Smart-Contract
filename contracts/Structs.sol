// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8;

/**
 * @dev Used in an array when an account wants to send their
 * tokens to multiple accounts.
 */
struct BulkTransfer {
    address to;
    uint256 value;
}

/**
 * @dev Used in an array when an account wants to send others'
 * tokens (through allowance mechanism) to multiple accounts.
 */
struct BulkTransferFrom {
    address from;
    address to;
    uint256 value;
}
