import { expect } from "chai";
import hre from "hardhat";
import type { BaseContract } from "ethers";
import { LCX, LCX__factory, ProxyAdmin, TokenIssueManager, TokenIssueManager__factory, TransparentUpgradeableProxy, TransparentUpgradeableProxy__factory } from "../typechain-types";

const { ethers } = hre;

describe("Token Issue Manager", function () {

    const DEFAULT_ADMIN_ROLE = ethers.zeroPadValue("0x", 32);
    const OWNER_ROLE = ethers.id("OWNER_ROLE");
    const ISSUER_ROLE = ethers.id("ISSUER_ROLE");

    async function deploy() {
        const [owner, stakeManager, treasury] = await ethers.getSigners();

        const LcxFactory = await ethers.getContractFactory("LCX");
        const TokenIssueManagerFactory = await ethers.getContractFactory("TokenIssueManager");
        const ProxyFactory = await ethers.getContractFactory("TransparentUpgradeableProxy");

        // Deploy LCX token
        const lcxImplementation = await LcxFactory.deploy();
        await lcxImplementation.waitForDeployment();
        let initData = LcxFactory.interface.encodeFunctionData("initialize", [owner.address]);
        const lcxProxy = await ProxyFactory.deploy(
            lcxImplementation,
            owner,
            initData,
        );
        await lcxProxy.waitForDeployment();
        const lcx = LcxFactory.attach(lcxProxy) as LCX;

        // Deploy TokenIssueManager
        const tokenIssueManagerImplementation = await TokenIssueManagerFactory.deploy();
        await tokenIssueManagerImplementation.waitForDeployment();
        initData = TokenIssueManagerFactory.interface.encodeFunctionData("initialize",
            [owner.address, await lcx.getAddress(), stakeManager.address, treasury.address]
        );
        const tokenIssueManagerProxy = await ProxyFactory.deploy(
            tokenIssueManagerImplementation,
            owner,
            initData,
        );
        await tokenIssueManagerProxy.waitForDeployment();
        const tokenIssueManager = TokenIssueManagerFactory.attach(tokenIssueManagerProxy) as TokenIssueManager;

        return {
            owner,
            stakeManager,
            treasury,
            lcxImplementation: lcxImplementation as LCX,
            lcxProxy: lcxProxy as TransparentUpgradeableProxy,
            tokenIssueManagerImplementation: tokenIssueManagerImplementation as TokenIssueManager,
            tokenIssueManagerProxy: tokenIssueManagerProxy as TransparentUpgradeableProxy,
            lcx,
            tokenIssueManager,
        };
    }

    async function deployAndPrepare() {
        const deployedResult = await deploy();
        const { lcx, tokenIssueManager } = deployedResult;
        // Grant LCX Token Issuer role to TokenIssueManager
        await lcx.grantRole(ISSUER_ROLE, tokenIssueManager);
        return deployedResult;
    }

    async function getProxyAdmin(proxyContract: TransparentUpgradeableProxy & BaseContract) {
        const proxyInterface = TransparentUpgradeableProxy__factory.createInterface();
        const events = await proxyContract.queryFilter("AdminChanged", 0);
        const event = events[0];
        const decoded = proxyInterface.decodeEventLog("AdminChanged", event.data, event.topics);
        const ProxyAdminFactory = await ethers.getContractFactory("ProxyAdmin");
        return ProxyAdminFactory.attach(decoded.newAdmin) as ProxyAdmin;
    }

    describe("Deployment and upgrade", function () {

        it("Should deploy with the correct owner and token parameters", async function () {
            const { tokenIssueManager: contract, owner, lcx, stakeManager, treasury } = await deployAndPrepare();

            expect(await contract.owner()).to.equal(owner, "Owner not valid on initialization");
            expect(await contract.lcxToken()).to.equal(await lcx.getAddress(), "LCX Token not valid on initialization");
            expect(await contract.stakeManager()).to.equal(stakeManager, "Stake Manager not valid on initialization");
            expect(await contract.treasury()).to.equal(treasury, "Treasury not valid on initialization");
            expect(await contract.annualIssueRate()).to.equal(800, "Annual issue rate not valid on initialization");
            expect(await contract.initialSupply()).to.equal(0);
            expect(await contract.firstIssuedAt()).to.equal(0);
        });

        it("Should not allow independent initialization of implementation contract", async function () {
            const { owner, lcx, stakeManager, treasury, tokenIssueManagerImplementation } = await deployAndPrepare();
            await expect(
                tokenIssueManagerImplementation.initialize(owner, lcx, stakeManager, treasury)
            ).to.be.revertedWithCustomError(
                { interface: TokenIssueManager__factory.createInterface() },
                "InvalidInitialization"
            );
        });

        it("Should upgrade as per the transparent proxy pattern", async function () {
            const { tokenIssueManagerProxy } = await deployAndPrepare();

            const TokenIssueManagerFactory = await ethers.getContractFactory("TokenIssueManager");
            const newImplementation = await TokenIssueManagerFactory.deploy();
            await newImplementation.waitForDeployment();

            const proxyAdmin = await getProxyAdmin(tokenIssueManagerProxy);
            await expect(proxyAdmin.upgradeAndCall(tokenIssueManagerProxy, newImplementation, "0x")).to.be.fulfilled;
        });
    });

    describe("Access control privileges", function () {
        // TODO
        it("Should have the correct role admins");

        it("Should have correct roles assignment");

        it("Should allow the owner to add or remove token issuers");

        it("Should update role memberships on transferring ownership");

        it("Should allow the owner to pause and unpause the contract");

        it("Should allow the owner to ");
    });
});
