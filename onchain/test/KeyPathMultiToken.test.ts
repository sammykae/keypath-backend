import { expect } from "chai";
import { ethers } from "hardhat";
import { KeyPathMultiToken } from "../typechain-types/contracts";

describe("KeyPathMultiToken", function () {
    let token: KeyPathMultiToken;
    let owner: any;
    let minter: any;
    let user1: any;
    let user2: any;

    const BASE_URI = "https://api.keypath.com/tokens/";
    const TOKEN_ID_1 = 1n;
    const TOKEN_ID_2 = 2n;
    const PROPERTY_ID_1 = "prop-123";
    const PROPERTY_ID_2 = "prop-456";
    const TOKEN_NAME_1 = "Property Token 1";
    const TOKEN_NAME_2 = "Property Token 2";
    const TOKEN_SYMBOL_1 = "PT1";
    const TOKEN_SYMBOL_2 = "PT2";
    const MAX_SUPPLY_1 = ethers.parseEther("1000000");
    const MAX_SUPPLY_2 = ethers.parseEther("2000000");

    beforeEach(async function () {
        [owner, minter, user1, user2] = await ethers.getSigners();

        const TokenFactory = await ethers.getContractFactory("KeyPathMultiToken");
        token = (await TokenFactory.deploy(BASE_URI, owner.address)) as unknown as KeyPathMultiToken;

        // Register properties
        await token.registerProperty(
            TOKEN_ID_1,
            PROPERTY_ID_1,
            TOKEN_NAME_1,
            TOKEN_SYMBOL_1,
            MAX_SUPPLY_1
        );

        await token.registerProperty(
            TOKEN_ID_2,
            PROPERTY_ID_2,
            TOKEN_NAME_2,
            TOKEN_SYMBOL_2,
            MAX_SUPPLY_2
        );
    });

    describe("Deployment", function () {
        it("Should set the correct base URI", async function () {
            expect(await token.uri(TOKEN_ID_1)).to.equal(BASE_URI);
        });

        it("Should set owner as admin and minter", async function () {
            const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
            const MINTER_ROLE = await token.MINTER_ROLE();

            expect(await token.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
            expect(await token.hasRole(MINTER_ROLE, owner.address)).to.be.true;
        });
    });

    describe("Property Registration", function () {
        it("Should allow owner to register new property", async function () {
            const newTokenId = 3n;
            const newPropertyId = "prop-789";
            const newName = "Property Token 3";
            const newSymbol = "PT3";
            const newMaxSupply = ethers.parseEther("500000");

            await expect(token.registerProperty(newTokenId, newPropertyId, newName, newSymbol, newMaxSupply))
                .to.emit(token, "PropertyRegistered")
                .withArgs(newTokenId, newPropertyId, newName, newSymbol, newMaxSupply);

            expect(await token.propertyIds(newTokenId)).to.equal(newPropertyId);
            expect(await token.tokenNames(newTokenId)).to.equal(newName);
            expect(await token.tokenSymbols(newTokenId)).to.equal(newSymbol);
            expect(await token.maxSupply(newTokenId)).to.equal(newMaxSupply);
        });

        it("Should prevent non-owner from registering properties", async function () {
            await expect(
                token.connect(user1).registerProperty(
                    3n,
                    "prop-789",
                    "Property Token 3",
                    "PT3",
                    ethers.parseEther("500000")
                )
            ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
        });

        it("Should prevent registering duplicate token ID", async function () {
            await expect(
                token.registerProperty(
                    TOKEN_ID_1,
                    "prop-duplicate",
                    "Duplicate",
                    "DUP",
                    ethers.parseEther("100000")
                )
            ).to.be.revertedWith("KeyPathMultiToken: Token ID already registered");
        });

        it("Should prevent registering with zero max supply", async function () {
            await expect(
                token.registerProperty(
                    3n,
                    "prop-789",
                    "Property Token 3",
                    "PT3",
                    0
                )
            ).to.be.revertedWith("KeyPathMultiToken: Max supply must be greater than 0");
        });
    });

    describe("Minting", function () {
        it("Should allow owner to mint tokens", async function () {
            const amount = ethers.parseEther("1000");
            await expect(token.mint(user1.address, TOKEN_ID_1, amount, "0x"))
                .to.emit(token, "TokensMinted")
                .withArgs(user1.address, TOKEN_ID_1, amount, PROPERTY_ID_1);

            expect(await token.balanceOf(user1.address, TOKEN_ID_1)).to.equal(amount);
            expect(await token.totalSupply(TOKEN_ID_1)).to.equal(amount);
        });

        it("Should allow minter role to mint tokens", async function () {
            const MINTER_ROLE = await token.MINTER_ROLE();
            await token.grantMinterRole(minter.address);

            const amount = ethers.parseEther("500");
            await token.connect(minter).mint(user1.address, TOKEN_ID_1, amount, "0x");

            expect(await token.balanceOf(user1.address, TOKEN_ID_1)).to.equal(amount);
        });

        it("Should prevent non-minter from minting", async function () {
            const amount = ethers.parseEther("1000");
            await expect(token.connect(user1).mint(user2.address, TOKEN_ID_1, amount, "0x"))
                .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
        });

        it("Should prevent minting unregistered token ID", async function () {
            const amount = ethers.parseEther("1000");
            await expect(token.mint(user1.address, 999n, amount, "0x"))
                .to.be.revertedWith("KeyPathMultiToken: Token ID not registered");
        });

        it("Should prevent minting beyond max supply", async function () {
            const amount = MAX_SUPPLY_1 + ethers.parseEther("1");
            await expect(token.mint(user1.address, TOKEN_ID_1, amount, "0x"))
                .to.be.revertedWith("KeyPathMultiToken: Exceeds max supply");
        });

        it("Should allow minting up to max supply", async function () {
            await token.mint(user1.address, TOKEN_ID_1, MAX_SUPPLY_1, "0x");
            expect(await token.totalSupply(TOKEN_ID_1)).to.equal(MAX_SUPPLY_1);
        });
    });

    describe("Batch Minting", function () {
        it("Should allow batch minting multiple token IDs", async function () {
            const tokenIds = [TOKEN_ID_1, TOKEN_ID_2];
            const amounts = [ethers.parseEther("100"), ethers.parseEther("200")];

            await expect(token.mintBatch(user1.address, tokenIds, amounts, "0x"))
                .to.emit(token, "BatchTokensMinted")
                .withArgs(user1.address, tokenIds, amounts);

            expect(await token.balanceOf(user1.address, TOKEN_ID_1)).to.equal(amounts[0]);
            expect(await token.balanceOf(user1.address, TOKEN_ID_2)).to.equal(amounts[1]);
        });

        it("Should prevent batch minting with mismatched arrays", async function () {
            const tokenIds = [TOKEN_ID_1, TOKEN_ID_2];
            const amounts = [ethers.parseEther("100")];

            await expect(token.mintBatch(user1.address, tokenIds, amounts, "0x"))
                .to.be.revertedWith("KeyPathMultiToken: Arrays length mismatch");
        });

        it("Should prevent batch minting unregistered token ID", async function () {
            const tokenIds = [TOKEN_ID_1, 999n];
            const amounts = [ethers.parseEther("100"), ethers.parseEther("200")];

            await expect(token.mintBatch(user1.address, tokenIds, amounts, "0x"))
                .to.be.revertedWith("KeyPathMultiToken: Token ID not registered");
        });
    });

    describe("Max Supply Management", function () {
        it("Should allow owner to update max supply", async function () {
            const newMaxSupply = MAX_SUPPLY_1 * 2n;
            await token.setMaxSupply(TOKEN_ID_1, newMaxSupply);
            expect(await token.maxSupply(TOKEN_ID_1)).to.equal(newMaxSupply);
        });

        it("Should prevent non-owner from updating max supply", async function () {
            const newMaxSupply = MAX_SUPPLY_1 * 2n;
            await expect(token.connect(user1).setMaxSupply(TOKEN_ID_1, newMaxSupply))
                .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
        });

        it("Should prevent setting max supply below current supply", async function () {
            const mintAmount = ethers.parseEther("1000");
            await token.mint(user1.address, TOKEN_ID_1, mintAmount, "0x");

            const newMaxSupply = mintAmount - 1n;
            await expect(token.setMaxSupply(TOKEN_ID_1, newMaxSupply))
                .to.be.revertedWith("KeyPathMultiToken: New max supply below current supply");
        });
    });

    describe("Property Info", function () {
        it("Should return correct property information", async function () {
            const amount = ethers.parseEther("500");
            await token.mint(user1.address, TOKEN_ID_1, amount, "0x");

            const info = await token.getPropertyInfo(TOKEN_ID_1);
            expect(info[0]).to.equal(PROPERTY_ID_1); // propertyId
            expect(info[1]).to.equal(TOKEN_NAME_1); // name
            expect(info[2]).to.equal(TOKEN_SYMBOL_1); // symbol
            expect(info[3]).to.equal(amount); // currentSupply
            expect(info[4]).to.equal(MAX_SUPPLY_1); // maxSupply
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
    });

    describe("Transfers", function () {
        beforeEach(async function () {
            await token.mint(user1.address, TOKEN_ID_1, ethers.parseEther("1000"), "0x");
        });

        it("Should allow token transfers", async function () {
            const amount = ethers.parseEther("100");
            await token.connect(user1).safeTransferFrom(user1.address, user2.address, TOKEN_ID_1, amount, "0x");

            expect(await token.balanceOf(user1.address, TOKEN_ID_1)).to.equal(ethers.parseEther("900"));
            expect(await token.balanceOf(user2.address, TOKEN_ID_1)).to.equal(amount);
        });

        it("Should allow batch transfers", async function () {
            await token.mint(user1.address, TOKEN_ID_2, ethers.parseEther("500"), "0x");

            const tokenIds = [TOKEN_ID_1, TOKEN_ID_2];
            const amounts = [ethers.parseEther("100"), ethers.parseEther("200")];

            await token.connect(user1).safeBatchTransferFrom(
                user1.address,
                user2.address,
                tokenIds,
                amounts,
                "0x"
            );

            expect(await token.balanceOf(user2.address, TOKEN_ID_1)).to.equal(amounts[0]);
            expect(await token.balanceOf(user2.address, TOKEN_ID_2)).to.equal(amounts[1]);
        });
    });
});

