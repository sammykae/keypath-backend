// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title KeyPathMultiToken
 * @dev ERC-1155 multi-token standard for multiple property tokenization
 * @notice This contract can represent tokens for multiple properties
 * @notice Each property is represented by a unique token ID
 * @notice Minting is restricted to owner/admin roles
 */
contract KeyPathMultiToken is ERC1155, Ownable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    
    // Mapping from token ID to property identifier
    mapping(uint256 => string) public propertyIds;
    
    // Mapping from token ID to maximum supply
    mapping(uint256 => uint256) public maxSupply;
    
    // Mapping from token ID to current total supply
    mapping(uint256 => uint256) public totalSupply;
    
    // Token metadata (name, symbol per token ID)
    mapping(uint256 => string) public tokenNames;
    mapping(uint256 => string) public tokenSymbols;
    
    event TokensMinted(
        address indexed to,
        uint256 indexed tokenId,
        uint256 amount,
        string propertyId
    );
    event BatchTokensMinted(
        address indexed to,
        uint256[] tokenIds,
        uint256[] amounts
    );
    event PropertyRegistered(
        uint256 indexed tokenId,
        string propertyId,
        string name,
        string symbol,
        uint256 maxSupply
    );
    
    /**
     * @dev Constructor
     * @param uri Base URI for token metadata
     * @param _initialOwner Address that will own the contract and have admin roles
     */
    constructor(
        string memory uri,
        address _initialOwner
    ) ERC1155(uri) Ownable(_initialOwner) {
        // Grant admin role to owner
        _grantRole(DEFAULT_ADMIN_ROLE, _initialOwner);
        _grantRole(MINTER_ROLE, _initialOwner);
    }
    
    /**
     * @dev Register a new property token
     * @param tokenId Unique token ID for this property
     * @param _propertyId Property identifier from off-chain system
     * @param name Token name
     * @param symbol Token symbol
     * @param _maxSupply Maximum supply for this property token
     * @notice Only owner can register new properties
     */
    function registerProperty(
        uint256 tokenId,
        string memory _propertyId,
        string memory name,
        string memory symbol,
        uint256 _maxSupply
    ) public onlyOwner {
        require(bytes(propertyIds[tokenId]).length == 0, "KeyPathMultiToken: Token ID already registered");
        require(_maxSupply > 0, "KeyPathMultiToken: Max supply must be greater than 0");
        
        propertyIds[tokenId] = _propertyId;
        tokenNames[tokenId] = name;
        tokenSymbols[tokenId] = symbol;
        maxSupply[tokenId] = _maxSupply;
        
        emit PropertyRegistered(tokenId, _propertyId, name, symbol, _maxSupply);
    }
    
    /**
     * @dev Mint tokens for a specific property
     * @param to Address to receive the tokens
     * @param tokenId Token ID (property identifier)
     * @param amount Amount of tokens to mint
     * @param data Additional data (can be empty)
     * @notice Only addresses with MINTER_ROLE can call this
     */
    function mint(
        address to,
        uint256 tokenId,
        uint256 amount,
        bytes memory data
    ) public onlyRole(MINTER_ROLE) {
        require(bytes(propertyIds[tokenId]).length > 0, "KeyPathMultiToken: Token ID not registered");
        require(totalSupply[tokenId] + amount <= maxSupply[tokenId], "KeyPathMultiToken: Exceeds max supply");
        
        totalSupply[tokenId] += amount;
        _mint(to, tokenId, amount, data);
        
        emit TokensMinted(to, tokenId, amount, propertyIds[tokenId]);
    }
    
    /**
     * @dev Batch mint tokens for multiple properties
     * @param to Address to receive the tokens
     * @param tokenIds Array of token IDs
     * @param amounts Array of amounts to mint (must match tokenIds length)
     * @param data Additional data (can be empty)
     * @notice Only addresses with MINTER_ROLE can call this
     */
    function mintBatch(
        address to,
        uint256[] memory tokenIds,
        uint256[] memory amounts,
        bytes memory data
    ) public onlyRole(MINTER_ROLE) {
        require(tokenIds.length == amounts.length, "KeyPathMultiToken: Arrays length mismatch");
        
        // Check all supplies before minting
        for (uint256 i = 0; i < tokenIds.length; i++) {
            require(bytes(propertyIds[tokenIds[i]]).length > 0, "KeyPathMultiToken: Token ID not registered");
            require(totalSupply[tokenIds[i]] + amounts[i] <= maxSupply[tokenIds[i]], "KeyPathMultiToken: Exceeds max supply");
        }
        
        // Update supplies
        for (uint256 i = 0; i < tokenIds.length; i++) {
            totalSupply[tokenIds[i]] += amounts[i];
        }
        
        _mintBatch(to, tokenIds, amounts, data);
        
        emit BatchTokensMinted(to, tokenIds, amounts);
    }
    
    /**
     * @dev Batch mint tokens to multiple recipients
     * @param recipients Array of addresses to receive tokens
     * @param tokenIds Array of token IDs (same for all recipients)
     * @param amounts Array of amounts per recipient (must match recipients length)
     * @param data Additional data (can be empty)
     * @notice Only addresses with MINTER_ROLE can call this
     */
    function mintBatchToMultiple(
        address[] memory recipients,
        uint256[] memory tokenIds,
        uint256[] memory amounts,
        bytes memory data
    ) public onlyRole(MINTER_ROLE) {
        require(recipients.length == amounts.length, "KeyPathMultiToken: Recipients and amounts length mismatch");
        
        // Check all supplies before minting
        uint256[] memory totalAmountsPerToken = new uint256[](tokenIds.length);
        for (uint256 i = 0; i < recipients.length; i++) {
            for (uint256 j = 0; j < tokenIds.length; j++) {
                totalAmountsPerToken[j] += amounts[i];
            }
        }
        
        for (uint256 j = 0; j < tokenIds.length; j++) {
            require(bytes(propertyIds[tokenIds[j]]).length > 0, "KeyPathMultiToken: Token ID not registered");
            require(totalSupply[tokenIds[j]] + totalAmountsPerToken[j] <= maxSupply[tokenIds[j]], "KeyPathMultiToken: Exceeds max supply");
        }
        
        // Mint to each recipient
        for (uint256 i = 0; i < recipients.length; i++) {
            uint256[] memory singleAmounts = new uint256[](tokenIds.length);
            for (uint256 j = 0; j < tokenIds.length; j++) {
                singleAmounts[j] = amounts[i];
            }
            
            // Update supplies
            for (uint256 j = 0; j < tokenIds.length; j++) {
                totalSupply[tokenIds[j]] += amounts[i];
            }
            
            _mintBatch(recipients[i], tokenIds, singleAmounts, data);
        }
    }
    
    /**
     * @dev Update maximum supply for a property token (only owner)
     * @param tokenId Token ID
     * @param _newMaxSupply New maximum supply
     */
    function setMaxSupply(uint256 tokenId, uint256 _newMaxSupply) public onlyOwner {
        require(bytes(propertyIds[tokenId]).length > 0, "KeyPathMultiToken: Token ID not registered");
        require(_newMaxSupply >= totalSupply[tokenId], "KeyPathMultiToken: New max supply below current supply");
        maxSupply[tokenId] = _newMaxSupply;
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
    
    /**
     * @dev Get property information for a token ID
     * @param tokenId Token ID
     * @return _propertyId Property identifier
     * @return name Token name
     * @return symbol Token symbol
     * @return currentSupply Current total supply
     * @return _maxSupply Maximum supply
     */
    function getPropertyInfo(uint256 tokenId) public view returns (
        string memory _propertyId,
        string memory name,
        string memory symbol,
        uint256 currentSupply,
        uint256 _maxSupply
    ) {
        return (
            propertyIds[tokenId],
            tokenNames[tokenId],
            tokenSymbols[tokenId],
            totalSupply[tokenId],
            maxSupply[tokenId]
        );
    }
    
    /**
     * @dev Override supportsInterface to handle multiple inheritance
     * @param interfaceId The interface identifier
     * @return bool Whether the contract supports the interface
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}

