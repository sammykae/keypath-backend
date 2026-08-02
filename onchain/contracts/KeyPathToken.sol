// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title KeyPathToken
 * @dev ERC-20 token for property tokenization
 * @notice This contract represents tokens for a single property
 * @notice Minting is restricted to owner/admin roles
 */
contract KeyPathToken is ERC20, Ownable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    
    // Property identifier (e.g., property ID from off-chain system)
    string public propertyId;
    
    // Token metadata
    uint256 public maxSupply;
    
    event TokensMinted(address indexed to, uint256 amount, string propertyId);
    event MaxSupplyUpdated(uint256 newMaxSupply);
    
    /**
     * @dev Constructor
     * @param _name Token name (e.g., "KeyPath Property Token - Chestnut Ridge")
     * @param _symbol Token symbol (e.g., "KPT-CHSTRFD")
     * @param _propertyId Property identifier from off-chain system
     * @param _maxSupply Maximum token supply for this property
     * @param _initialOwner Address that will own the contract and have admin roles
     */
    constructor(
        string memory _name,
        string memory _symbol,
        string memory _propertyId,
        uint256 _maxSupply,
        address _initialOwner
    ) ERC20(_name, _symbol) Ownable(_initialOwner) {
        propertyId = _propertyId;
        maxSupply = _maxSupply;
        
        // Grant admin role to owner
        _grantRole(DEFAULT_ADMIN_ROLE, _initialOwner);
        _grantRole(MINTER_ROLE, _initialOwner);
    }
    
    /**
     * @dev Mint tokens to a specific address
     * @param to Address to receive the tokens
     * @param amount Amount of tokens to mint
     * @notice Only addresses with MINTER_ROLE can call this
     */
    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= maxSupply, "KeyPathToken: Exceeds max supply");
        _mint(to, amount);
        emit TokensMinted(to, amount, propertyId);
    }
    
    /**
     * @dev Batch mint tokens to multiple addresses
     * @param recipients Array of addresses to receive tokens
     * @param amounts Array of amounts to mint (must match recipients length)
     * @notice Only addresses with MINTER_ROLE can call this
     */
    function mintBatch(address[] memory recipients, uint256[] memory amounts) public onlyRole(MINTER_ROLE) {
        require(recipients.length == amounts.length, "KeyPathToken: Arrays length mismatch");
        
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }
        
        require(totalSupply() + totalAmount <= maxSupply, "KeyPathToken: Exceeds max supply");
        
        for (uint256 i = 0; i < recipients.length; i++) {
            _mint(recipients[i], amounts[i]);
            emit TokensMinted(recipients[i], amounts[i], propertyId);
        }
    }
    
    /**
     * @dev Update maximum supply (only owner)
     * @param _newMaxSupply New maximum supply
     */
    function setMaxSupply(uint256 _newMaxSupply) public onlyOwner {
        require(_newMaxSupply >= totalSupply(), "KeyPathToken: New max supply below current supply");
        maxSupply = _newMaxSupply;
        emit MaxSupplyUpdated(_newMaxSupply);
    }
    
    /**
     * @dev Grant minter role to an address
     * @param account Address to grant minter role
     */
    function grantMinterRole(address account) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(MINTER_ROLE, account);
    }
    
    /**
     * @dev Revoke minter role from an address
     * @param account Address to revoke minter role
     */
    function revokeMinterRole(address account) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(MINTER_ROLE, account);
    }
}

