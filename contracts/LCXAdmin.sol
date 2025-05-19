// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlEnumerableUpgradeable.sol";

/**
 * @title LCXAdmin
 * @author Liechtenstein Cryptoassets Exchange (Developed by Dharmveer Bharti)
 * @notice Handles admin management and related functionalities
 *  for the token.
 */
abstract contract LCXAdmin is
    Ownable2StepUpgradeable,
    AccessControlEnumerableUpgradeable,
    PausableUpgradeable
{
    using EnumerableSet for EnumerableSet.AddressSet;

    bytes32 public constant OWNER_ROLE = keccak256("OWNER_ROLE");
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant BLACKLISTER_ROLE = keccak256("BLACKLISTER_ROLE");

    // ----- Storage -----

    /// @custom:storage-location erc7201:lcx.storage.LCXAdmin
    struct LCXAdminStorage {
        EnumerableSet.AddressSet _blacklistedAddresses;
    }

    // keccak256(abi.encode(uint256(keccak256(bytes("lcx.storage.LCXAdmin"))) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant LCXAdminStorageLocation = 0xdbdc0e54e7070d56ba0e176e8307ba151e21ef4954967e239c4403d9b7f6ff00;

    // ----- Custom Errors -----

    error RenounceOwnershipDisabled();
    error AccountBlacklisted(address account);

    // ----- Events -----

    event AddedToBlacklist(address indexed account, address caller);
    event RemovedFromBlacklist(address indexed account, address caller);

    // ----- Functions -----

    function _getLCXAdminStorage() private pure returns (LCXAdminStorage storage $) {
        assembly {
            $.slot := LCXAdminStorageLocation
        }
    }

    /**
     * @dev Initializes the contract. Sets role admins, grants `owner` all roles.
     * @param owner the initial owner address
     */
    function __LCXTokenAdmin_init(address owner) internal onlyInitializing {
        __Ownable_init(owner);

        _setRoleAdmin(ISSUER_ROLE, OWNER_ROLE);
        _setRoleAdmin(PAUSER_ROLE, OWNER_ROLE);
        _setRoleAdmin(BLACKLISTER_ROLE, OWNER_ROLE);

        _grantRole(OWNER_ROLE, owner);
        _grantRole(ISSUER_ROLE, owner);
        _grantRole(PAUSER_ROLE, owner);
        _grantRole(BLACKLISTER_ROLE, owner);
    }

    /**
     * @dev Renouncing ownership is disabled
     */
    function renounceOwnership() public pure override {
        revert RenounceOwnershipDisabled();
    }

    /**
     * @dev Transfer ownership to the pending owner.
     * Also transfers the access roles.
     */
    function acceptOwnership() public override {
        address oldOwner = owner();
        super.acceptOwnership();
        address newOwner = owner();
        _revokeRole(OWNER_ROLE, oldOwner);
        _revokeRole(ISSUER_ROLE, oldOwner);
        _revokeRole(PAUSER_ROLE, oldOwner);
        _revokeRole(BLACKLISTER_ROLE, oldOwner);
        _grantRole(OWNER_ROLE, newOwner);
        _grantRole(ISSUER_ROLE, newOwner);
        _grantRole(PAUSER_ROLE, newOwner);
        _grantRole(BLACKLISTER_ROLE, newOwner);
    }

    /**
     * @dev Pause the contract.
     *
     * Requirements:
     * - Caller must have the Pauser role
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @dev Un-pause the contract.
     *
     * Requirements:
     * - Caller must have the Pauser role
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @dev Adds an account to the blacklist.
     * Also revokes Issuer role, Pauser role and Blacklister role from that account.
     *
     * Requirements:
     * - Caller must have the Blacklister role
     *
     * @param account The account address to be added to the blacklist
     *
     * @return added `true` if account was added,
     *               `false` otherwise (i.e. account was already in the blacklist)
     */
    function addToBlacklist(
        address account
    ) external onlyRole(BLACKLISTER_ROLE) returns (bool added) {
        LCXAdminStorage storage $ = _getLCXAdminStorage();
        if (hasRole(ISSUER_ROLE, account)) {
            _revokeRole(ISSUER_ROLE, account);
        }
        if (hasRole(PAUSER_ROLE, account)) {
            _revokeRole(PAUSER_ROLE, account);
        }
        if (hasRole(BLACKLISTER_ROLE, account)) {
            _revokeRole(BLACKLISTER_ROLE, account);
        }
        added = $._blacklistedAddresses.add(account);
        if (added) {
            emit AddedToBlacklist(account, _msgSender());
        }
    }

    /**
     * @dev Removes an account from the blacklist.
     *
     * Requirements:
     * - Caller must have the Blacklister role
     *
     * @param account The account address to be removed from the blacklist
     *
     * @return removed `true` if account was removed,
     *                 `false` otherwise (i.e. account was not in the blacklist)
     */
    function removeFromBlacklist(
        address account
    ) external onlyRole(BLACKLISTER_ROLE) returns (bool removed) {
        LCXAdminStorage storage $ = _getLCXAdminStorage();
        removed = $._blacklistedAddresses.remove(account);
        if (removed) {
            emit RemovedFromBlacklist(account, _msgSender());
        }
    }

    function isBlacklisted(address account) public view returns (bool) {
        LCXAdminStorage storage $ = _getLCXAdminStorage();
        return $._blacklistedAddresses.contains(account);
    }

    function getBlacklistedAccountsCount() external view returns (uint256) {
        LCXAdminStorage storage $ = _getLCXAdminStorage();
        return $._blacklistedAddresses.length();
    }

    function getAllBlacklistedAccounts()
        external
        view
        returns (address[] memory)
    {
        LCXAdminStorage storage $ = _getLCXAdminStorage();
        return $._blacklistedAddresses.values();
    }

    function getBlacklistedAccountAt(
        uint256 index
    ) external view returns (address) {
        LCXAdminStorage storage $ = _getLCXAdminStorage();
        return $._blacklistedAddresses.at(index);
    }

    function _requireNotBlacklisted(address account) internal view {
        if (isBlacklisted(account)) {
            revert AccountBlacklisted(account);
        }
    }
}
