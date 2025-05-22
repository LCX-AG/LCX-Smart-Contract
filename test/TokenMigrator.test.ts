import { expect } from "chai";
import hre from "hardhat";
import type { BaseContract } from "ethers";

import { LCX, LCX__factory, ProxyAdmin, TransparentUpgradeableProxy, TransparentUpgradeableProxy__factory } from "../typechain-types";
import { lcxTokenOldSol } from "../typechain-types/contracts/mock";

const { ethers } = hre;

describe("Token Migrator", function () {

    const DEFAULT_ADMIN_ROLE = ethers.zeroPadValue("0x", 32);
    const OWNER_ROLE = ethers.id("OWNER_ROLE");
    const ISSUER_ROLE = ethers.id("ISSUER_ROLE");

    async function deploy() {
        const [owner] = await ethers.getSigners();

        const LcxFactory = await ethers.getContractFactory("LCX");
        const OldLcxFactory = await ethers.getContractFactory("lcxToken");
        const TokenMigratorFactory = await ethers.getContractFactory("TokenMigrator");
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

        // Deploy Old LCX token
        const lcxOld = await OldLcxFactory.deploy(ethers.parseEther((1_000_000_000).toString()));
        await lcxOld.waitForDeployment();

        // Deploy TokenMigrator
        const tokenMigrator = await TokenMigratorFactory.deploy(lcxOld, lcx);

        return {
            owner,
            lcxImplementation: lcxImplementation as LCX,
            lcx,
            lcxOld: lcxOld as lcxTokenOldSol.LcxToken,
            tokenMigrator,
        };
    }

    async function deployAndPrepare() {
        const deployedResult = await deploy();
        const { lcx, tokenMigrator } = deployedResult;
        // Grant LCX Token Issuer role to TokenMigrator
        await lcx.grantRole(ISSUER_ROLE, tokenMigrator);
        return deployedResult;
    }

    it("Should be deployed with correct token addresses", async function () {
        const { lcx, lcxOld, tokenMigrator } = await deploy();

        expect(await lcxOld.totalSupply()).to.be.greaterThan(0);
        expect(await lcx.totalSupply()).to.equal(0);
        expect(await tokenMigrator.lcxOld()).to.equal(await lcxOld.getAddress());
        expect(await tokenMigrator.lcxNew()).to.equal(await lcx.getAddress());
    });

    it("Should migrate old to new tokens", async function () {
        const { owner, lcx, lcxOld, tokenMigrator } = await deployAndPrepare();

        const tokenAmt = await lcxOld.balanceOf(owner);
        expect(tokenAmt).to.be.greaterThan(0);
        expect(await lcx.balanceOf(owner)).to.equal(0);

        await lcxOld.connect(owner).approve(tokenMigrator, tokenAmt);

        await expect(
            tokenMigrator.migrate(tokenAmt)
        ).to.emit(
            tokenMigrator, "Migrated"
        ).withArgs(owner, tokenAmt);
    });
});
