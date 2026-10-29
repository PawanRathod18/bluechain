// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CarbonCreditNFT
 * @notice ERC-721 representation of a *modelled* blue-carbon quantity recorded by the
 *         BlueChain MRV layer.
 *
 * @dev Deliberately conservative: the contract records provenance and lifecycle state.
 *      It cannot, by itself, establish ecological validity, additionality, permanence,
 *      eligibility, ownership or registry approval. A token is not a certified credit.
 *
 *      Lifecycle: ISSUED -> TRANSFERRED -> RETIRED. Retirement is recorded in state and
 *      blocks further transfers so the audit trail survives.
 */
contract CarbonCreditNFT is ERC721URIStorage, Ownable {
    struct Credit {
        uint256 projectId;      // off-chain BlueChain project id
        uint256 tonnes;         // modelled tonnes of carbon, scaled by 100
        uint64 issuedAt;        // unix timestamp
        bool retired;
    }

    /// @notice Monotonic token id; 0 is never a valid token.
    uint256 public nextTokenId = 1;

    mapping(uint256 => Credit) public credits;
    mapping(uint256 => uint256) public listingPrice;   // wei, 0 = not listed
    mapping(address => bool) public minters;

    event CreditIssued(
        uint256 indexed tokenId,
        uint256 indexed projectId,
        uint256 tonnes,
        string uri
    );
    event CreditRetired(uint256 indexed tokenId, uint64 retiredAt);
    event ListingPriceSet(uint256 indexed tokenId, uint256 priceWei);
    event MinterUpdated(address indexed account, bool allowed);

    error NotMinter();
    error InvalidAmount();
    error TokenDoesNotExist();
    error AlreadyRetired();
    error NotTokenOwner();
    error RetiredTokenIsSoulbound();

    modifier onlyMinter() {
        if (!minters[msg.sender]) revert NotMinter();
        _;
    }

    constructor() ERC721("BlueChain Carbon Credit", "BCCC") Ownable(msg.sender) {
        minters[msg.sender] = true;
        emit MinterUpdated(msg.sender, true);
    }

    /* ------------------------------------------------------------------ admin */

    function setMinter(address account, bool allowed) external onlyOwner {
        minters[account] = allowed;
        emit MinterUpdated(account, allowed);
    }

    /* ------------------------------------------------------------------- mint */

    /**
     * @param to        recipient (project developer)
     * @param projectId BlueChain project id this credit belongs to
     * @param tonnes    modelled tonnes of carbon, scaled by 100 (1235.62 t -> 123562)
     * @param uri       metadata URI (IPFS CID or gateway URL)
     */
    function mint(address to, uint256 projectId, uint256 tonnes, string calldata uri)
        external
        onlyMinter
        returns (uint256 tokenId)
    {
        if (projectId == 0) revert InvalidAmount();
        if (tonnes == 0) revert InvalidAmount();

        tokenId = nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);

        credits[tokenId] = Credit({
            projectId: projectId,
            tonnes: tonnes,
            issuedAt: uint64(block.timestamp),
            retired: false
        });

        emit CreditIssued(tokenId, projectId, tonnes, uri);
    }

    /* -------------------------------------------------------------- lifecycle */

    function setListingPrice(uint256 tokenId, uint256 priceWei) external {
        if (_ownerOf(tokenId) == address(0)) revert TokenDoesNotExist();
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        listingPrice[tokenId] = priceWei;
        emit ListingPriceSet(tokenId, priceWei);
    }

    /// @notice Retire a credit. Only the holder can retire; the token stays on-chain.
    function retire(uint256 tokenId) external {
        if (_ownerOf(tokenId) == address(0)) revert TokenDoesNotExist();
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (credits[tokenId].retired) revert AlreadyRetired();
        credits[tokenId].retired = true;
        listingPrice[tokenId] = 0;
        emit CreditRetired(tokenId, uint64(block.timestamp));
    }

    function totalSupply() external view returns (uint256) {
        return nextTokenId - 1;
    }

    function isRetired(uint256 tokenId) external view returns (bool) {
        return credits[tokenId].retired;
    }

    /* ----------------------------------------------------------------- hooks */

    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        // retired credits are soulbound: no transfer, no burn
        if (to != address(0) && credits[tokenId].retired) revert RetiredTokenIsSoulbound();
        return super._update(to, tokenId, auth);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
