// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

interface IERC20BurnableOnly {
    function burnFrom(address from, uint256 value) external;
}

interface IERC20IssuableOnly {
    function issueTokens(address account, uint256 value) external;
}

/**
 * @title TokenMigrator
 * @author Liechtenstein Cryptoassets Exchange
 * @notice Migrates the old LCX tokens to the new ones by
 * burning and issuing strategy
 */
contract TokenMigrator {
    IERC20BurnableOnly public immutable lcxOld;
    IERC20IssuableOnly public immutable lcxNew;

    error InvalidAmount(uint256 amount);
    event Migrated(address indexed account, uint256 value);

    constructor(address lcxOld_, address lcxNew_) {
        lcxOld = IERC20BurnableOnly(lcxOld_);
        lcxNew = IERC20IssuableOnly(lcxNew_);
    }

    /**
     * @dev Burns `value` Old LCX tokens from the caller account
     * and issues equal amount of New LCX tokens to the same account.
     *
     * Requirements:
     * - This contract must have Issuer role in the new LCX token contract
     * - This contract must have old LCX token allowance of the caller
     * of at least `value` amount
     *
     * @param value amount of tokens to migrate
     */
    function migrate(uint256 value) external {
        if (value == 0) revert InvalidAmount(value);
        lcxOld.burnFrom(msg.sender, value);
        lcxNew.issueTokens(msg.sender, value);
        emit Migrated(msg.sender, value);
    }
}
