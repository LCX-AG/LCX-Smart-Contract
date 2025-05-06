# LCX Token Smart Contract

LCX is an upgradeable **ERC-20 compliant token** designed with additional features like **strict supply management**, **permission-based minting**, **blacklisting** for compliance, and emergency **pausing** of minting, transferring and burning of tokens.

See [LCXTokenUpgradeable](contracts/LCXTokenUpgradeable.sol)

### Features

-   **ERC-20 Standard**:
    -   Implements all required ERC-20 functions, ensuring compatibility with wallets and dApps.
-   **Access Control**:
    -   The owner can assign multiple accounts with `MINTER_ROLE`, `PAUSER_ROLE`, `BLACKLISTER_ROLE`
    -   Owner can be changed via. a safer 2-step process, where the nominated owner account has to accept ownership.
    -   The primary owner account would be a multi-sig wallet, for robust security.
-   **Permissioned Minting**:
    -   Accounts with `MINTER_ROLE` can mint tokens.
    -   Can easily be integrated with bridging contracts for cross-chain transfers.
-   **Burnable**:
    -   Implements `burn()` and `burnFrom()` utilizing allowance mechanism.
-   **Account blacklisting**:
    -   Accounts can be blacklisted, halting any token flow from / to / through them.
-   **Emergency pause**:
    -   Allows an account with `PAUSER_ROLE` to pause the contract, stopping all token flow (mint, transfer, burn)
-   **Upgradeable**:
    -   Implements **transparent upgradeable proxy** pattern.

### Technical Details

See [Documentation](docs/DOCUMENTATION.md)

### For Auditing

See [Audit Readme](docs/AUDIT-README.md)
