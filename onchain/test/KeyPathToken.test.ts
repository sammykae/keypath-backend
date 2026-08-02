import { expect } from "chai";
import { ethers } from "hardhat";
import { KeyPathToken } from "../typechain-types/contracts";

describe("KeyPathToken", function () {
    let token: KeyPathToken;
    let owner: any;
    let minter: any;
    let user1: any;
    let user2: any;

    const TOKEN_NAME = "KeyPath Property Token";
    const TOKEN_SYMBOL = "KPT";
    const PROPERTY_ID = "prop-123";
    const MAX_SUPPLY = ethers.parseEther("1000000");

    beforeEach(async function () {
        [owner, minter, user1, user2] = await ethers.getSigners();

        const TokenFactory = await ethers.getContractFactory("KeyPathToken");
        token = (await TokenFactory.deploy(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            PROPERTY_ID,
            MAX_SUPPLY,
            owner.address
        )) as unknown as KeyPathToken;
    });

    describe("Deployment", function () {
        it("Should set the correct name and symbol", async function () {
            expect(await token.name()).to.equal(TOKEN_NAME);
            expect(await token.symbol()).to.equal(TOKEN_SYMBOL);
        });

        it("Should set the correct property ID", async function () {
            expect(await token.propertyId()).to.equal(PROPERTY_ID);
        });

        it("Should set the correct max supply", async function () {
            expect(await token.maxSupply()).to.equal(MAX_SUPPLY);
        });

        it("Should set owner as admin and minter", async function () {
            const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
            const MINTER_ROLE = await token.MINTER_ROLE();

            expect(await token.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
            expect(await token.hasRole(MINTER_ROLE, owner.address)).to.be.true;
        });

        it("Should have zero initial supply", async function () {
            expect(await token.totalSupply()).to.equal(0);
        });
    });

    describe("Minting", function () {
        it("Should allow owner to mint tokens", async function () {
            const amount = ethers.parseEther("1000");
            await expect(token.mint(user1.address, amount))
                .to.emit(token, "TokensMinted")
                .withArgs(user1.address, amount, PROPERTY_ID);

            expect(await token.balanceOf(user1.address)).to.equal(amount);
            expect(await token.totalSupply()).to.equal(amount);
        });

        it("Should allow minter role to mint tokens", async function () {
            const MINTER_ROLE = await token.MINTER_ROLE();
            await token.grantMinterRole(minter.address);

            const amount = ethers.parseEther("500");
            await token.connect(minter).mint(user1.address, amount);

            expect(await token.balanceOf(user1.address)).to.equal(amount);
        });

        it("Should prevent non-minter from minting", async function () {
            const amount = ethers.parseEther("1000");
            await expect(token.connect(user1).mint(user2.address, amount))
                .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
        });

        it("Should prevent minting beyond max supply", async function () {
            const amount = MAX_SUPPLY + ethers.parseEther("1");
            await expect(token.mint(user1.address, amount))
                .to.be.revertedWith("KeyPathToken: Exceeds max supply");
        });

        it("Should allow minting up to max supply", async function () {
            await token.mint(user1.address, MAX_SUPPLY);
            expect(await token.totalSupply()).to.equal(MAX_SUPPLY);
        });
    });

    describe("Batch Minting", function () {
        it("Should allow batch minting to multiple recipients", async function () {
            const amounts = [
                ethers.parseEther("100"),
                ethers.parseEther("200"),
                ethers.parseEther("300")
            ];
            const recipients = [user1.address, user2.address, minter.address];

            await token.mintBatch(recipients, amounts);

            expect(await token.balanceOf(user1.address)).to.equal(amounts[0]);
            expect(await token.balanceOf(user2.address)).to.equal(amounts[1]);
            expect(await token.balanceOf(minter.address)).to.equal(amounts[2]);
        });

        it("Should prevent batch minting with mismatched arrays", async function () {
            const amounts = [ethers.parseEther("100"), ethers.parseEther("200")];
            const recipients = [user1.address];

            await expect(token.mintBatch(recipients, amounts))
                .to.be.revertedWith("KeyPathToken: Arrays length mismatch");
        });

        it("Should prevent batch minting beyond max supply", async function () {
            const amounts = [
                MAX_SUPPLY / 2n + 1n,
                MAX_SUPPLY / 2n + 1n
            ];
            const recipients = [user1.address, user2.address];

            await expect(token.mintBatch(recipients, amounts))
                .to.be.revertedWith("KeyPathToken: Exceeds max supply");
        });
    });

    describe("Max Supply Management", function () {
        it("Should allow owner to update max supply", async function () {
            const newMaxSupply = MAX_SUPPLY * 2n;
            await expect(token.setMaxSupply(newMaxSupply))
                .to.emit(token, "MaxSupplyUpdated")
                .withArgs(newMaxSupply);

            expect(await token.maxSupply()).to.equal(newMaxSupply);
        });

        it("Should prevent non-owner from updating max supply", async function () {
            const newMaxSupply = MAX_SUPPLY * 2n;
            await expect(token.connect(user1).setMaxSupply(newMaxSupply))
                .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
        });

        it("Should prevent setting max supply below current supply", async function () {
            const mintAmount = ethers.parseEther("1000");
            await token.mint(user1.address, mintAmount);

            const newMaxSupply = mintAmount - 1n;
            await expect(token.setMaxSupply(newMaxSupply))
                .to.be.revertedWith("KeyPathToken: New max supply below current supply");
        });
    });

    describe("Role Management", function () {
        it("Should allow admin to grant minter role", async function () {
            const MINTER_ROLE = await token.MINTER_ROLE();
            await token.grantMinterRole(minter.address);
            expect(await token.hasRole(MINTER_ROLE, minter.address)).to.be.true;
        });

        it("Should allow admin to revoke minter role", async function () {
            const MINTER_ROLE = await token.MINTER_ROLE();
            await token.grantMinterRole(minter.address);
            await token.revokeMinterRole(minter.address);
            expect(await token.hasRole(MINTER_ROLE, minter.address)).to.be.false;
        });

        it("Should prevent non-admin from granting roles", async function () {
            await expect(token.connect(user1).grantMinterRole(minter.address))
                .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
        });
    });

    describe("Transfers", function () {
        beforeEach(async function () {
            await token.mint(user1.address, ethers.parseEther("1000"));
        });

        it("Should allow token transfers", async function () {
            const amount = ethers.parseEther("100");
            await token.connect(user1).transfer(user2.address, amount);

            expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("900"));
            expect(await token.balanceOf(user2.address)).to.equal(amount);
        });

        it("Should prevent transfers exceeding balance", async function () {
            const amount = ethers.parseEther("2000");
            await expect(token.connect(user1).transfer(user2.address, amount))
                .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
        });
    });
});

