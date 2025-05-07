// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import "./LCXAdmin.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

/**
 * @title LCX
 * @author Liechtenstein Cryptoassets Exchange (Developed by Dharmveer Bharti)
 * @notice Implementation contract for LCX Token
 *
 * Token details:
 * - Name: LCX
 * - Symbol: LCX
 * - Decimals: 18
 */
contract LCX is LCXAdmin, ERC20Upgradeable {
    // ----- Custom Errors -----

    error DecreaseAllowanceBelowZero(
        uint256 currentAllowance,
        uint256 subtractedValue
    );

    // ----- Constructor -----

    /**
     * @dev Disable independent initialization of implementation contract
     */
    constructor() {
        _disableInitializers();
    }

    // ----- Functions -----

    /**
     * @dev Initializes the contract.
     * @param owner the initial owner address
     */
    function initialize(address owner) external initializer {
        __ERC20_init("LCX", "LCX");
        __LCXTokenAdmin_init(owner);
    }

    /**
     * @dev Issues `value` amount of tokens and assigns them to `account`
     *
     * Requirements:
     * - Caller must have the Issuer role
     * - The contract must not be paused (enforced in `_update()`)
     *
     * @param account receiving address
     * @param value amount of tokens to issue (in smallest units)
     */
    function issueTokens(
        address account,
        uint256 value
    ) external onlyRole(ISSUER_ROLE) {
        _mint(account, value);
    }

    /**
     * @dev Burns `value` amount of tokens from the caller's address
     *
     * Requirements:
     * - The contract must not be paused
     *
     * @param value amount of tokens to burn (in smallest units)
     */
    function burn(uint256 value) public virtual {
        _burn(_msgSender(), value);
    }

    /**
     * @dev Burns `value` amount of tokens from `account`,  deducting from
     * the caller's allowance.
     *
     * Requirements:
     * - The contract must not be paused
     *
     * @param account the account to burn tokens from
     * @param value amount of tokens to burn (in smallest units)
     */
    function burnFrom(address account, uint256 value) public virtual {
        _spendAllowance(account, _msgSender(), value);
        _burn(account, value);
    }

    /**
     * @dev Atomically increases the allowance granted to `spender` by the caller.
     *
     * Requirements:
     * - `spender` cannot be the zero address.
     */
    function increaseAllowance(
        address spender,
        uint256 addedValue
    ) public virtual returns (bool) {
        address owner = _msgSender();
        _approve(owner, spender, allowance(owner, spender) + addedValue);
        return true;
    }

    /**
     * @dev Atomically decreases the allowance granted to `spender` by the caller.
     *
     * Requirements:
     * - `spender` cannot be the zero address.
     * - `spender` must have allowance for the caller of at least
     * `subtractedValue`.
     */
    function decreaseAllowance(
        address spender,
        uint256 subtractedValue
    ) public virtual returns (bool) {
        address owner = _msgSender();
        uint256 currentAllowance = allowance(owner, spender);
        if (currentAllowance < subtractedValue) {
            revert DecreaseAllowanceBelowZero(
                currentAllowance,
                subtractedValue
            );
        }
        unchecked {
            _approve(owner, spender, currentAllowance - subtractedValue);
        }
        return true;
    }

    /**
     * @dev See {ERC20Upgradeable:_update}
     *
     * Added requirements:
     * - The contract must not be paused. That means, a paused state halts
     *    all issuing, transferring and burning.
     * - `to` must not be the contract itself. That means tokens can't be
     *    transferred or issued to the (proxy) contract address.
     * - `from`, `to` and the caller must not be blacklisted.
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override whenNotPaused {
        if (to == address(this)) {
            revert ERC20InvalidReceiver(address(this));
        }
        _requireNotBlacklisted(from);
        _requireNotBlacklisted(to);
        if (_msgSender() != from) {
            _requireNotBlacklisted(_msgSender());
        }
        super._update(from, to, value);
    }
}
