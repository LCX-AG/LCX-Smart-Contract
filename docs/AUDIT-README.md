# LCX Token Smart Contract - Audit Guidelines

## Scope

```
contracts/
    |-  LCXAdmin.sol
    |-  LCX.sol
    |-  Proxies.sol
```

## Start with the documentation

-   See [Technical Documentation](DOCUMENTATION.md)

-   See [test cases](/test/LCXToken.test.ts)

## Assumptions - before the audit

-   The owner account is a multi-sig wallet.

-   The same owner is used for both the ERC-20 implementation contract (`LCX`) as well as the `ProxyAdmin` contract.

-   The file `Proxies.sol` contains contracts directly copied from OpenZeppelin with only one change: `ProxyAdmin` inherits `Ownable2Step` instead of `Ownable`.

## Where to focus for bugs

-   Access control logic (in `LCXAdmin`): DoS attack vectors

-   Bypass of access control allowing token flow that should've been restricted
