// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlEnumerableUpgradeable.sol";

import "./Structs.sol";
import {LCX} from "./LCX.sol";

/**
 * @title TokenIssueManager
 * @author Liechtenstein Cryptoassets Exchange
 * @notice Manages issuing of new LCX tokens with per year simple interest rate
 */
contract TokenIssueManager is
    Ownable2StepUpgradeable,
    AccessControlEnumerableUpgradeable,
    PausableUpgradeable
{
    bytes32 public constant OWNER_ROLE = keccak256("OWNER_ROLE");
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    uint256 internal constant BASIS_POINTS = 10000;

    /// @custom:storage-location erc7201:lcx.storage.TokenIssueManager
    struct TokenIssueManagerStorage {
        LCX _lcxToken;
        address _stakeManager;
        address _treasury;
        uint256 _initialSupply;
        uint256 _annualIssueRate; // percentage rate with base 10000
        uint256 _firstIssuedAt; // first token issue timestamp
    }

    // keccak256(abi.encode(uint256(keccak256(bytes("lcx.storage.TokenIssueManager"))) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant TokenIssueManagerStorageLocation =
        0x0fc34c0545c93be005e8d8b5db567dca0c4e2994f1c813ba6e0ea067b27ad000;

    error RenounceOwnershipDisabled();
    error ZeroAddress();
    error InvalidAmount(uint256 value);
    error SupplyAlreadyInitiated();
    error NoInitialSupply();

    event StakeManagerUpdated(address oldAddress, address newAddress);
    event TreasuryUpdated(address oldAddress, address newAddress);
    event AnnualIssueRateUpdated(uint256 oldRate, uint256 newRate);

    constructor() {
        _disableInitializers();
    }

    function _getTokenIssueManagerStorage()
        private
        pure
        returns (TokenIssueManagerStorage storage $)
    {
        assembly {
            $.slot := TokenIssueManagerStorageLocation
        }
    }

    /**
     * @dev Initializes the contract.
     * Sets the annual interest rate to 8%.
     *
     * @param owner_ the initial owner address
     * @param lcxToken_ LCX token contract address
     * @param stakeManager_ stake manager contract address
     * @param treasury_ treasury address
     */
    function initialize(
        address owner_,
        address lcxToken_,
        address stakeManager_,
        address treasury_
    ) external initializer {
        if (
            lcxToken_ == address(0) ||
            stakeManager_ == address(0) ||
            treasury_ == address(0)
        ) revert ZeroAddress();

        __Ownable_init(owner_);

        _setRoleAdmin(ISSUER_ROLE, OWNER_ROLE);
        _grantRole(OWNER_ROLE, owner_);
        _grantRole(ISSUER_ROLE, owner_);

        TokenIssueManagerStorage storage $ = _getTokenIssueManagerStorage();
        $._lcxToken = LCX(lcxToken_);
        $._stakeManager = stakeManager_;
        $._treasury = treasury_;
        uint256 _annualIssueRate = 800; // 8% with base 10000
        $._annualIssueRate = _annualIssueRate;

        emit StakeManagerUpdated(address(0), stakeManager_);
        emit TreasuryUpdated(address(0), treasury_);
        emit AnnualIssueRateUpdated(0, _annualIssueRate);
    }

    /**
     * @dev Issues LCX tokens for the first time.
     *
     * Total extra supply (for some predefined wallets) should not be greater
     * than the annual issue interest rate (i.e. 8% of the specified initial supply).
     *
     * Requirements:
     * - The contract must not be paused
     * - Caller must have the Issuer role
     *
     * @param initialSupply_ initial token supply
     * @param extraSupply_ extra token supply for a specified set of addresses
     */
    function issueTokensInitial(
        uint256 initialSupply_,
        BulkTransfer[] memory extraSupply_
    ) external whenNotPaused onlyRole(ISSUER_ROLE) {
        TokenIssueManagerStorage storage $ = _getTokenIssueManagerStorage();
        if ($._firstIssuedAt != 0) revert SupplyAlreadyInitiated();
        $._firstIssuedAt = block.timestamp;

        uint256 _totalExtraSupply;
        uint256 i;
        uint256 len = extraSupply_.length;
        for (; i < len; ) {
            _totalExtraSupply += extraSupply_[i].value;
            unchecked {
                ++i;
            }
        }

        $._initialSupply = $._lcxToken.totalSupply() + initialSupply_;

        if (
            _totalExtraSupply >
            ($._initialSupply * $._annualIssueRate) / BASIS_POINTS
        ) revert InvalidAmount(_totalExtraSupply);

        $._lcxToken.issueTokens(
            address(this),
            initialSupply_ + _totalExtraSupply
        );
        $._lcxToken.bulkTransfer(extraSupply_);
    }

    /**
     * @dev Issues new LCX tokens periodically. Expected to be called annually,
     * but not necessarily.
     *
     * Issuing new tokens follows the simple interest formula with
     * principle amount = `_initialSupply`
     * and yearly interest rate = `_annualIssueRate`
     *
     * Transfers the newly minted tokens to the treasury and the stake manager.
     *
     * Requirements:
     * - The contract must not be paused
     * - Caller must have the Issuer role
     */
    function issueTokensPeriodic()
        external
        whenNotPaused
        onlyRole(ISSUER_ROLE)
    {
        TokenIssueManagerStorage memory $ = _getTokenIssueManagerStorage();
        if ($._firstIssuedAt == 0) revert NoInitialSupply();

        uint256 timeElapsed = block.timestamp - $._firstIssuedAt;
        uint256 currentSupply = $._lcxToken.totalSupply();
        uint256 newSupply = ($._initialSupply *
            (BASIS_POINTS + ($._annualIssueRate * timeElapsed) / 365 days)) /
            BASIS_POINTS;

        if (newSupply <= currentSupply) revert InvalidAmount(newSupply);

        uint256 amountToIssue = newSupply - currentSupply;
        uint256 treasuryAmt = (amountToIssue * 2) / 5;
        uint256 stakeManagerAmt = amountToIssue - treasuryAmt;

        $._lcxToken.issueTokens(address(this), amountToIssue);

        BulkTransfer[] memory transfers = new BulkTransfer[](2);
        transfers[0] = BulkTransfer({to: $._treasury, value: treasuryAmt});
        transfers[1] = BulkTransfer({
            to: $._stakeManager,
            value: stakeManagerAmt
        });

        $._lcxToken.bulkTransfer(transfers);
    }

    /**
     * @dev Transfers the tokens from this contract to multiple addresses.
     *
     * Requirements:
     * - The contract must not be paused
     * - Caller must have the Issuer role
     *
     * @param transfers list of token receivers and their corresponding
     * token amounts
     */
    function distributeTokens(
        BulkTransfer[] calldata transfers
    ) external whenNotPaused onlyRole(ISSUER_ROLE) {
        TokenIssueManagerStorage storage $ = _getTokenIssueManagerStorage();
        $._lcxToken.bulkTransfer(transfers);
    }

    /**
     * @dev Update stake manager address.
     *
     * Requirements:
     * - Caller must be the contract owner
     */
    function setStakeManager(address newAddress) external onlyOwner {
        TokenIssueManagerStorage storage $ = _getTokenIssueManagerStorage();
        address oldAddress = $._stakeManager;
        $._stakeManager = newAddress;
        emit StakeManagerUpdated(oldAddress, newAddress);
    }

    /**
     * @dev Update treasury address.
     *
     * Requirements:
     * - Caller must be the contract owner
     */
    function setTreasury(address newAddress) external onlyOwner {
        TokenIssueManagerStorage storage $ = _getTokenIssueManagerStorage();
        address oldAddress = $._treasury;
        $._treasury = newAddress;
        emit TreasuryUpdated(oldAddress, newAddress);
    }

    /**
     * @dev Update annual token issuing interest rate.
     *
     * Requirements:
     * - Caller must be the contract owner
     * - The new rate must not be greater than 20%
     */
    function setAnnualIssueRate(uint256 newRate) external onlyOwner {
        // Should not be more than 20%
        if (newRate > 2000) revert InvalidAmount(newRate);
        TokenIssueManagerStorage storage $ = _getTokenIssueManagerStorage();
        uint256 oldRate = $._annualIssueRate;
        $._annualIssueRate = newRate;
        emit AnnualIssueRateUpdated(oldRate, newRate);
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
        _grantRole(OWNER_ROLE, newOwner);
        _grantRole(ISSUER_ROLE, newOwner);
    }

    /**
     * @dev Pause the contract.
     *
     * Requirements:
     * - Caller must be the contract owner
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Un-pause the contract.
     *
     * Requirements:
     * - Caller must be the contract owner
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    function lcxToken() external view returns (LCX) {
        TokenIssueManagerStorage storage $ = _getTokenIssueManagerStorage();
        return $._lcxToken;
    }

    function stakeManager() external view returns (address) {
        TokenIssueManagerStorage storage $ = _getTokenIssueManagerStorage();
        return $._stakeManager;
    }

    function treasury() external view returns (address) {
        TokenIssueManagerStorage storage $ = _getTokenIssueManagerStorage();
        return $._treasury;
    }

    function initialSupply() external view returns (uint256) {
        TokenIssueManagerStorage storage $ = _getTokenIssueManagerStorage();
        return $._initialSupply;
    }

    function annualIssueRate() external view returns (uint256) {
        TokenIssueManagerStorage storage $ = _getTokenIssueManagerStorage();
        return $._annualIssueRate;
    }

    function firstIssuedAt() external view returns (uint256) {
        TokenIssueManagerStorage storage $ = _getTokenIssueManagerStorage();
        return $._firstIssuedAt;
    }
}
