import { expect } from "chai";
import hre from "hardhat";
import type { BaseContract } from "ethers";
import { LCX, LCX__factory, ProxyAdmin, TransparentUpgradeableProxy, TransparentUpgradeableProxy__factory } from "../typechain-types";

const { ethers } = hre;

describe("LCX Token", function () {

    async function deploy() {
        const [owner] = await ethers.getSigners();

        // Deploy the implementation contract
        const LcxFactory = await ethers.getContractFactory("LCX");
        const implementation = await expect(LcxFactory.deploy()).to.be.fulfilled;
        await implementation.waitForDeployment();

        // Deploy the proxy
        const ProxyFactory = await ethers.getContractFactory("TransparentUpgradeableProxy");
        const initData = LcxFactory.interface.encodeFunctionData("initialize", [owner.address]);
        const proxy = await expect(ProxyFactory.deploy(
            implementation,  // _logic
            owner,          // initialOwner for ProxyAdmin contract
            initData,               // _data for initialization of implementation contract
        )).to.be.fulfilled;
        await proxy.waitForDeployment();

        const contract = LcxFactory.attach(proxy) as LCX;

        return {
            owner,
            implementation: implementation as LCX,
            proxy: proxy as TransparentUpgradeableProxy,
            contract,
        };
    }

    async function getProxyAdmin(proxyContract: TransparentUpgradeableProxy & BaseContract) {
        const proxyInterface = TransparentUpgradeableProxy__factory.createInterface();
        const events = await proxyContract.queryFilter("AdminChanged", 0);
        const event = events[0];
        const decoded = proxyInterface.decodeEventLog("AdminChanged", event.data, event.topics);
        const ProxyAdminFactory = await ethers.getContractFactory("ProxyAdmin");
        return ProxyAdminFactory.attach(decoded.newAdmin) as ProxyAdmin;
    }

    function getRoles() {
        return {
            DEFAULT_ADMIN_ROLE: ethers.zeroPadValue("0x", 32),
            OWNER_ROLE: ethers.id("OWNER_ROLE"),
            ISSUER_ROLE: ethers.id("ISSUER_ROLE"),
            PAUSER_ROLE: ethers.id("PAUSER_ROLE"),
            BLACKLISTER_ROLE: ethers.id("BLACKLISTER_ROLE"),
        };
    }

    describe("Deployment and upgrade", function () {

        it("Should deploy with the correct owner and token parameters", async function () {
            const { owner, contract } = await deploy();
            expect(await contract.owner()).to.equal(owner, "Owner not valid on initialization");

            expect(await contract.name()).to.equal("LCX");
            expect(await contract.symbol()).to.equal("LCX");
            expect(await contract.decimals()).to.equal(18);
        });

        it("Should not allow independent initialization of implementation contract", async function () {
            const { owner, implementation } = await deploy();
            await expect(
                implementation.initialize(owner)
            ).to.be.revertedWithCustomError(
                { interface: LCX__factory.createInterface() },
                "InvalidInitialization"
            );
        });

        it("Should upgrade as per the transparent proxy pattern", async function () {
            const { owner, implementation, proxy } = await deploy();

            const LcxFactory = await ethers.getContractFactory("LCX");
            const newImplementation = await LcxFactory.deploy();
            await newImplementation.waitForDeployment();

            const proxyAdmin = await getProxyAdmin(proxy);
            await expect(proxyAdmin.upgradeAndCall(proxy.target, newImplementation.target, "0x")).to.be.fulfilled;
        });

        it("Should not allow zero address as the initial owner", async function () {
            const [owner] = await ethers.getSigners();

            const LcxFactory = await ethers.getContractFactory("LCX");
            const implementation = await LcxFactory.deploy();
            await implementation.waitForDeployment();

            const ProxyFactory = await ethers.getContractFactory("TransparentUpgradeableProxy");
            const initData = LcxFactory.interface.encodeFunctionData("initialize", [ethers.ZeroAddress]);
            await expect(
                ProxyFactory.deploy(implementation, owner, initData)
            ).to.be.revertedWithCustomError(
                { interface: LcxFactory.interface },
                "OwnableInvalidOwner"
            ).withArgs(ethers.ZeroAddress);
        });
    });

    describe("Access control privileges", function () {

        it("Should have the correct role admins", async function () {
            const { contract } = await deploy();

            const { DEFAULT_ADMIN_ROLE, OWNER_ROLE, ISSUER_ROLE, PAUSER_ROLE, BLACKLISTER_ROLE } = getRoles();

            expect(await contract.getRoleAdmin(OWNER_ROLE)).to.equal(DEFAULT_ADMIN_ROLE);
            expect(await contract.getRoleAdmin(ISSUER_ROLE)).to.equal(OWNER_ROLE);
            expect(await contract.getRoleAdmin(PAUSER_ROLE)).to.equal(OWNER_ROLE);
            expect(await contract.getRoleAdmin(BLACKLISTER_ROLE)).to.equal(OWNER_ROLE);
        });

        it("Should have different roles assigned to the owner", async function () {
            const { contract, owner } = await deploy();

            const { DEFAULT_ADMIN_ROLE, OWNER_ROLE, ISSUER_ROLE, PAUSER_ROLE, BLACKLISTER_ROLE } = getRoles();

            expect(await contract.getRoleMemberCount(DEFAULT_ADMIN_ROLE)).to.equal(0);

            expect(await contract.getRoleMemberCount(OWNER_ROLE)).to.equal(1);
            expect(await contract.getRoleMember(OWNER_ROLE, 0)).to.equal(owner);

            expect(await contract.getRoleMemberCount(ISSUER_ROLE)).to.equal(0);

            expect(await contract.getRoleMemberCount(PAUSER_ROLE)).to.equal(1);
            expect(await contract.getRoleMember(PAUSER_ROLE, 0)).to.equal(owner);

            expect(await contract.getRoleMemberCount(BLACKLISTER_ROLE)).to.equal(1);
            expect(await contract.getRoleMember(BLACKLISTER_ROLE, 0)).to.equal(owner);
        });

        it("Should allow the owner to add and remove other role members", async function () {
            const { contract, owner } = await deploy();

            const account = (await ethers.getSigners())[1];
            expect(account).to.not.equal(owner, "Selected account and the owner are same");

            const { ISSUER_ROLE, PAUSER_ROLE, BLACKLISTER_ROLE } = getRoles();

            await expect(contract.grantRole(ISSUER_ROLE, account)).to.be.fulfilled;
            expect(await contract.getRoleMemberCount(ISSUER_ROLE)).to.equal(1);
            await expect(contract.revokeRole(ISSUER_ROLE, account)).to.be.fulfilled;
            expect(await contract.getRoleMemberCount(ISSUER_ROLE)).to.equal(0);

            await expect(contract.grantRole(PAUSER_ROLE, account)).to.be.fulfilled;
            expect(await contract.getRoleMemberCount(PAUSER_ROLE)).to.equal(2);
            await expect(contract.revokeRole(PAUSER_ROLE, account)).to.be.fulfilled;
            expect(await contract.getRoleMemberCount(PAUSER_ROLE)).to.equal(1);

            await expect(contract.grantRole(BLACKLISTER_ROLE, account)).to.be.fulfilled;
            expect(await contract.getRoleMemberCount(BLACKLISTER_ROLE)).to.equal(2);
            await expect(contract.revokeRole(BLACKLISTER_ROLE, account)).to.be.fulfilled;
            expect(await contract.getRoleMemberCount(BLACKLISTER_ROLE)).to.equal(1);
        });

        it("Should update role memberships on transferring ownership", async function () {
            const { contract, owner } = await deploy();

            const account = (await ethers.getSigners())[1];
            expect(account).to.not.equal(owner, "Selected account and the owner are same");

            const { DEFAULT_ADMIN_ROLE, OWNER_ROLE, ISSUER_ROLE, PAUSER_ROLE, BLACKLISTER_ROLE } = getRoles();

            // Before
            expect(await contract.getRoleMemberCount(DEFAULT_ADMIN_ROLE)).to.equal(0);

            expect(await contract.getRoleMemberCount(OWNER_ROLE)).to.equal(1);
            expect(await contract.getRoleMember(OWNER_ROLE, 0)).to.equal(owner);

            expect(await contract.getRoleMemberCount(ISSUER_ROLE)).to.equal(0);

            expect(await contract.getRoleMemberCount(PAUSER_ROLE)).to.equal(1);
            expect(await contract.getRoleMember(PAUSER_ROLE, 0)).to.equal(owner);

            expect(await contract.getRoleMemberCount(BLACKLISTER_ROLE)).to.equal(1);
            expect(await contract.getRoleMember(BLACKLISTER_ROLE, 0)).to.equal(owner);

            // Transfer ownership
            await contract.transferOwnership(account);
            await contract.connect(account).acceptOwnership();

            // After: revoke all roles from the old owner and grant all roles to the new owner
            expect(await contract.getRoleMemberCount(DEFAULT_ADMIN_ROLE)).to.equal(0);

            expect(await contract.getRoleMemberCount(OWNER_ROLE)).to.equal(1);
            expect(await contract.getRoleMember(OWNER_ROLE, 0)).to.equal(account);

            expect(await contract.getRoleMemberCount(ISSUER_ROLE)).to.equal(0);

            expect(await contract.getRoleMemberCount(PAUSER_ROLE)).to.equal(1);
            expect(await contract.getRoleMember(PAUSER_ROLE, 0)).to.equal(account);

            expect(await contract.getRoleMemberCount(BLACKLISTER_ROLE)).to.equal(1);
            expect(await contract.getRoleMember(BLACKLISTER_ROLE, 0)).to.equal(account);
        });

        it("Should allow renounced owner role recovery by transferring ownership", async function () {
            const { contract, owner } = await deploy();

            const { OWNER_ROLE } = getRoles();

            // Before
            expect(await contract.getRoleMemberCount(OWNER_ROLE)).to.equal(1);
            expect(await contract.getRoleMember(OWNER_ROLE, 0)).to.equal(owner);

            // Owner: Renounce itself from owner role
            await contract.renounceRole(OWNER_ROLE, owner);

            // After renouncing
            expect(await contract.getRoleMemberCount(OWNER_ROLE)).to.equal(0);

            // Owner: Transfer ownership to itself
            await contract.transferOwnership(owner);
            await contract.connect(owner).acceptOwnership();

            // After transfer ownership
            expect(await contract.getRoleMemberCount(OWNER_ROLE)).to.equal(1);
            expect(await contract.getRoleMember(OWNER_ROLE, 0)).to.equal(owner);
        });

        it("Should allow a pauser role member to pause and unpause the contract", async function () {
            const { contract, owner } = await deploy();

            const { PAUSER_ROLE } = getRoles();
            expect(await contract.hasRole(PAUSER_ROLE, owner)).to.be.true;

            await expect(contract.connect(owner).pause()).to.be.fulfilled;
            expect(await contract.paused()).to.be.true;
            await expect(contract.connect(owner).unpause()).to.be.fulfilled;
            expect(await contract.paused()).to.be.false;
        });

        it("Should allow an issuer role member to issue tokens", async function () {
            const { contract, owner } = await deploy();

            const account = (await ethers.getSigners())[1];
            expect(account).to.not.equal(owner, "Selected account and the owner are same");

            const { ISSUER_ROLE } = getRoles();
            await expect(contract.connect(owner).grantRole(ISSUER_ROLE, account)).to.be.fulfilled;
            expect(await contract.hasRole(ISSUER_ROLE, account)).to.be.true;

            await expect(contract.connect(account).issueTokens(owner, 1000n)).to.be.fulfilled;
            expect(await contract.balanceOf(owner)).to.equal(1000n);
        });

        it("Should allow a blacklister role member to blacklist and un-blacklist an account", async function () {
            const { contract, owner } = await deploy();

            const { BLACKLISTER_ROLE } = getRoles();
            expect(await contract.hasRole(BLACKLISTER_ROLE, owner)).to.be.true;

            const account = (await ethers.getSigners())[9];

            await expect(contract.connect(owner).addToBlacklist(account)).to.be.fulfilled;
            expect(await contract.isBlacklisted(account)).to.be.true;
            await expect(contract.connect(owner).removeFromBlacklist(account)).to.be.fulfilled;
            expect(await contract.isBlacklisted(account)).to.be.false;
        });

        it("Should not allow a non-privileged account to carry out pause, issue, blacklist related operations", async function () {
            const { contract, owner } = await deploy();

            const { PAUSER_ROLE, ISSUER_ROLE, BLACKLISTER_ROLE } = getRoles();

            const signers = await ethers.getSigners();
            const runner = signers[1];
            const targetAccount = signers[9];
            expect(runner).to.not.equal(owner, "Selected account and the owner are same");

            // Pause, Unpause
            expect(await contract.hasRole(PAUSER_ROLE, runner)).to.be.false;
            await expect(
                contract.connect(runner).pause()
            ).to.be.revertedWithCustomError(
                { interface: contract.interface },
                "AccessControlUnauthorizedAccount"
            ).withArgs(
                runner,
                PAUSER_ROLE
            );
            await expect(
                contract.connect(runner).unpause()
            ).to.be.revertedWithCustomError(
                { interface: contract.interface },
                "AccessControlUnauthorizedAccount"
            ).withArgs(
                runner,
                PAUSER_ROLE
            );

            // Issue tokens
            expect(await contract.hasRole(ISSUER_ROLE, runner)).to.be.false;
            await expect(
                contract.connect(runner).issueTokens(targetAccount, 1000n)
            ).to.be.revertedWithCustomError(
                { interface: contract.interface },
                "AccessControlUnauthorizedAccount"
            ).withArgs(
                runner,
                ISSUER_ROLE
            );

            // Blacklist, Un-blacklist
            expect(await contract.hasRole(BLACKLISTER_ROLE, runner)).to.be.false;
            await expect(
                contract.connect(runner).addToBlacklist(targetAccount)
            ).to.be.revertedWithCustomError(
                { interface: contract.interface },
                "AccessControlUnauthorizedAccount"
            ).withArgs(
                runner,
                BLACKLISTER_ROLE
            );
            await expect(
                contract.connect(runner).removeFromBlacklist(targetAccount)
            ).to.be.revertedWithCustomError(
                { interface: contract.interface },
                "AccessControlUnauthorizedAccount"
            ).withArgs(
                runner,
                BLACKLISTER_ROLE
            );
        });

        it("Should revoke issuer, pauser, blacklister roles when an account is blacklisted", async function () {
            const { contract, owner } = await deploy();

            const { ISSUER_ROLE, PAUSER_ROLE, BLACKLISTER_ROLE } = getRoles();

            const account = (await ethers.getSigners())[1];
            expect(account).to.not.equal(owner, "Selected account and the owner are same");

            await contract.grantRole(ISSUER_ROLE, account);
            await contract.grantRole(PAUSER_ROLE, account);
            await contract.grantRole(BLACKLISTER_ROLE, account);
            expect(await contract.hasRole(ISSUER_ROLE, account)).to.be.true;
            expect(await contract.hasRole(PAUSER_ROLE, account)).to.be.true;
            expect(await contract.hasRole(BLACKLISTER_ROLE, account)).to.be.true;

            await contract.addToBlacklist(account);
            expect(await contract.hasRole(ISSUER_ROLE, account)).to.be.false;
            expect(await contract.hasRole(PAUSER_ROLE, account)).to.be.false;
            expect(await contract.hasRole(BLACKLISTER_ROLE, account)).to.be.false;
        });

        it("Should allow the owner to un-blacklist itself after being blacklisted", async function () {
            const { contract, owner } = await deploy();

            const { BLACKLISTER_ROLE } = getRoles();

            // A "malicious" account
            const account = (await ethers.getSigners())[1];
            expect(account).to.not.equal(owner, "Selected account and the owner are same");

            // Owner should have blacklisting privilege
            expect(await contract.hasRole(BLACKLISTER_ROLE, owner)).to.be.true;

            // Owner should also have the privilege to grant blacklisting privilege to an account
            expect(
                await contract.hasRole(
                    await contract.getRoleAdmin(BLACKLISTER_ROLE),
                    owner
                )
            ).to.be.true;

            // `account` is granted blacklisting privilege by the owner
            await contract.connect(owner).grantRole(BLACKLISTER_ROLE, account);

            // `account` blacklists `owner`
            await contract.connect(account).addToBlacklist(owner);


            // `owner` cannot un-blacklist any account now
            await expect(
                contract.connect(owner).removeFromBlacklist(owner)
            ).to.be.revertedWithCustomError(
                { interface: contract.interface },
                "AccessControlUnauthorizedAccount"
            ).withArgs(
                owner,
                BLACKLISTER_ROLE
            );

            // Now the owner should be able to revoke blacklisting privilege from `account`
            // then grant blacklisting role to itself, then remove itself from the blacklist.

            // `owner` revokes blacklisting role from `account`
            await expect(contract.connect(owner).revokeRole(BLACKLISTER_ROLE, account)).to.be.fulfilled;

            // `owner` is granted blacklisting role
            await expect(contract.connect(owner).grantRole(BLACKLISTER_ROLE, owner)).to.be.fulfilled;

            // `owner` removes itself from the blacklist
            await expect(contract.connect(owner).removeFromBlacklist(owner)).to.be.fulfilled;
        });
    });

    describe("Tokens flow", function () {

        it("Should not allow issuing, transfer, and burn when paused", async function () {
            const { contract, owner } = await deploy();

            const account = (await ethers.getSigners())[1];
            expect(account).to.not.equal(owner);

            // Before
            const { ISSUER_ROLE } = getRoles();
            await contract.grantRole(ISSUER_ROLE, owner);
            await expect(contract.issueTokens(owner, 1000n)).to.be.fulfilled;
            await contract.approve(account, 1000n);
            await expect(contract.transfer(account, 10n)).to.be.fulfilled;
            await expect(contract.connect(account).transferFrom(owner, account, 10n)).to.be.fulfilled;
            await expect(contract.burn(10n)).to.be.fulfilled;
            await expect(contract.connect(account).burnFrom(owner, 10n)).to.be.fulfilled;

            // Contract paused
            await contract.pause();

            // After
            await expect(contract.issueTokens(owner, 10n)).to.be.revertedWithCustomError(
                { interface: contract.interface },
                "EnforcedPause"
            );
            await expect(contract.transfer(account, 10n)).to.be.revertedWithCustomError(
                { interface: contract.interface },
                "EnforcedPause"
            );
            expect(await contract.allowance(owner, account)).to.be.greaterThanOrEqual(20n);
            await expect(
                contract.connect(account).transferFrom(owner, account, 10n)
            ).to.be.revertedWithCustomError(
                { interface: contract.interface },
                "EnforcedPause"
            );
            await expect(contract.burn(10n)).to.be.revertedWithCustomError(
                { interface: contract.interface },
                "EnforcedPause"
            );
            await expect(contract.connect(account).burnFrom(owner, 10n)).to.be.revertedWithCustomError(
                { interface: contract.interface },
                "EnforcedPause"
            );
        });

        it("Should not allow issuing or transfer of tokens to the token contract", async function () {
            const { contract, owner } = await deploy();

            const { ISSUER_ROLE } = getRoles();
            await contract.grantRole(ISSUER_ROLE, owner);

            // Issue tokens to contract address
            await expect(
                contract.issueTokens(contract, 1000n)
            ).to.be.revertedWithCustomError(
                { interface: contract.interface },
                "ERC20InvalidReceiver"
            ).withArgs(
                contract
            );

            // Transfer to contract address
            await expect(contract.issueTokens(owner, 1000n)).to.be.fulfilled;
            await expect(
                contract.connect(owner).transfer(contract, 10n)
            ).to.be.revertedWithCustomError(
                { interface: contract.interface },
                "ERC20InvalidReceiver"
            ).withArgs(
                contract
            );
        });

        it("Should not allow issuing or transfer or burn from / to a blacklisted account", async function () {
            const { contract, owner } = await deploy();

            const account = (await ethers.getSigners())[1];
            expect(account).to.not.equal(owner);

            const { ISSUER_ROLE } = getRoles();
            await contract.grantRole(ISSUER_ROLE, owner);
            await contract.issueTokens(owner, 1000n);
            await contract.transfer(account, 100n);
            expect(await contract.balanceOf(owner)).to.equal(900n);
            expect(await contract.balanceOf(account)).to.equal(100n);

            // Blacklist the account
            await contract.connect(owner).addToBlacklist(account);
            expect(await contract.isBlacklisted(account)).to.be.true;

            // Issue tokens
            await expect(
                contract.connect(owner).issueTokens(account, 10n)
            ).to.be.revertedWithCustomError(
                { interface: contract.interface },
                "AccountBlacklisted"
            ).withArgs(
                account
            );

            // Transfer to
            await expect(
                contract.connect(owner).transfer(account, 10n)
            ).to.be.revertedWithCustomError(
                { interface: contract.interface },
                "AccountBlacklisted"
            ).withArgs(
                account
            );

            // Transfer from
            await expect(
                contract.connect(account).transfer(owner, 10n)
            ).to.be.revertedWithCustomError(
                { interface: contract.interface },
                "AccountBlacklisted"
            ).withArgs(
                account
            );

            // Burn
            await expect(
                contract.connect(account).burn(10n)
            ).to.be.revertedWithCustomError(
                { interface: contract.interface },
                "AccountBlacklisted"
            ).withArgs(
                account
            );
        });

        it("Should not allow a blacklisted account to transfer or burn someone else's tokens through the allowance mechanism", async function () {
            const { contract, owner } = await deploy();

            const signers = await ethers.getSigners();
            const account = signers[1];
            const toAccount = signers[2];
            expect(account).to.not.equal(owner);
            expect(toAccount).to.not.equal(owner);

            const { ISSUER_ROLE } = getRoles();
            await contract.grantRole(ISSUER_ROLE, owner);
            await contract.connect(owner).issueTokens(owner, 1000n);
            await contract.connect(owner).approve(account, 500n);
            await contract.connect(owner).addToBlacklist(account);

            // transferFrom()
            await expect(
                contract.connect(account).transferFrom(owner, toAccount, 500n)
            ).to.be.revertedWithCustomError(
                { interface: contract.interface },
                "AccountBlacklisted"
            ).withArgs(
                account
            );

            // burnFrom()
            await expect(
                contract.connect(account).burnFrom(owner, 500n)
            ).to.be.revertedWithCustomError(
                { interface: contract.interface },
                "AccountBlacklisted"
            ).withArgs(
                account
            );
        });

        it("Should not allow a blacklisted account to transfer its own tokens to another account through the allowance mechanism", async function () {
            const { contract, owner } = await deploy();

            const signers = await ethers.getSigners();
            const account = signers[1];
            const toAccount = signers[2];
            expect(account).to.not.equal(owner);
            expect(toAccount).to.not.equal(owner);

            const { ISSUER_ROLE } = getRoles();
            await contract.grantRole(ISSUER_ROLE, owner);
            await contract.connect(owner).issueTokens(account, 1000n);
            await contract.connect(owner).addToBlacklist(account);

            await expect(contract.connect(account).approve(account, 1000n)).to.be.fulfilled;
            await expect(
                contract.connect(account).transferFrom(account, toAccount, 1000n)
            ).to.be.revertedWithCustomError(
                { interface: contract.interface },
                "AccountBlacklisted"
            ).withArgs(
                account
            );
        });
    });
});
