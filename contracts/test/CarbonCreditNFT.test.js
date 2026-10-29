const { expect } = require('chai')
const hre = require('hardhat')

const TONNES = (t) => BigInt(Math.round(t * 100))   // 1235.62 t -> 123562

describe('CarbonCreditNFT', () => {
  let contract, owner, verifier, developer, other

  beforeEach(async () => {
    ;[owner, verifier, developer, other] = await hre.ethers.getSigners()
    const factory = await hre.ethers.getContractFactory('CarbonCreditNFT')
    contract = await factory.deploy()
    await contract.waitForDeployment()
    await contract.setMinter(verifier.address, true)
  })

  it('starts empty with the deployer as minter', async () => {
    expect(await contract.totalSupply()).to.equal(0n)
    expect(await contract.nextTokenId()).to.equal(1n)
    expect(await contract.minters(owner.address)).to.equal(true)
    expect(await contract.name()).to.equal('BlueChain Carbon Credit')
    expect(await contract.symbol()).to.equal('BCCC')
  })

  it('mints a credit and records its provenance', async () => {
    const tx = await contract.connect(verifier).mint(
      developer.address, 7n, TONNES(1235.62), 'ipfs://bafkreidemo')
    const receipt = await tx.wait()

    const transfer = receipt.logs
      .map((l) => { try { return contract.interface.parseLog(l) } catch { return null } })
      .find((e) => e && e.name === 'CreditIssued')

    expect(transfer).to.not.equal(undefined)
    expect(transfer.args.tokenId).to.equal(1n)
    expect(transfer.args.projectId).to.equal(7n)

    expect(await contract.ownerOf(1n)).to.equal(developer.address)
    expect(await contract.tokenURI(1n)).to.equal('ipfs://bafkreidemo')

    const credit = await contract.credits(1n)
    expect(credit.projectId).to.equal(7n)
    expect(credit.tonnes).to.equal(TONNES(1235.62))
    expect(credit.retired).to.equal(false)
    expect(await contract.totalSupply()).to.equal(1n)
    expect(await contract.nextTokenId()).to.equal(2n)
  })

  it('only minters can mint', async () => {
    await expect(
      contract.connect(developer).mint(developer.address, 7n, TONNES(1), 'ipfs://x')
    ).to.be.revertedWithCustomError(contract, 'NotMinter')
  })

  it('rejects zero tonnes and project 0', async () => {
    await expect(
      contract.connect(verifier).mint(developer.address, 7n, 0n, 'ipfs://x')
    ).to.be.revertedWithCustomError(contract, 'InvalidAmount')
    await expect(
      contract.connect(verifier).mint(developer.address, 0n, TONNES(1), 'ipfs://x')
    ).to.be.revertedWithCustomError(contract, 'InvalidAmount')
  })

  it('owner can add and remove minters', async () => {
    await contract.connect(owner).setMinter(other.address, true)
    expect(await contract.minters(other.address)).to.equal(true)
    await contract.connect(other).mint(developer.address, 1n, TONNES(2), 'ipfs://a')
    await contract.connect(owner).setMinter(other.address, false)
    await expect(
      contract.connect(other).mint(developer.address, 1n, TONNES(2), 'ipfs://a')
    ).to.be.revertedWithCustomError(contract, 'NotMinter')
  })

  it('transfers like a normal ERC-721 before retirement', async () => {
    await contract.connect(verifier).mint(developer.address, 7n, TONNES(10), 'ipfs://a')
    await contract.connect(developer).transferFrom(developer.address, other.address, 1n)
    expect(await contract.ownerOf(1n)).to.equal(other.address)
  })

  it('retirement is recorded and makes the token soulbound', async () => {
    await contract.connect(verifier).mint(developer.address, 7n, TONNES(10), 'ipfs://a')
    await contract.connect(developer).setListingPrice(1n, hre.ethers.parseEther('1'))
    expect(await contract.listingPrice(1n)).to.equal(hre.ethers.parseEther('1'))

    await expect(contract.connect(developer).retire(1n))
      .to.emit(contract, 'CreditRetired')

    expect(await contract.isRetired(1n)).to.equal(true)
    expect(await contract.listingPrice(1n)).to.equal(0n)
    expect(await contract.ownerOf(1n)).to.equal(developer.address)

    await expect(
      contract.connect(developer).transferFrom(developer.address, other.address, 1n)
    ).to.be.revertedWithCustomError(contract, 'RetiredTokenIsSoulbound')

    await expect(contract.connect(developer).retire(1n))
      .to.be.revertedWithCustomError(contract, 'AlreadyRetired')
  })

  it('only the holder can set a price or retire', async () => {
    await contract.connect(verifier).mint(developer.address, 7n, TONNES(10), 'ipfs://a')
    await expect(contract.connect(other).setListingPrice(1n, 1n))
      .to.be.revertedWithCustomError(contract, 'NotTokenOwner')
    await expect(contract.connect(other).retire(1n))
      .to.be.revertedWithCustomError(contract, 'NotTokenOwner')
  })

  it('unknown tokens cannot be priced', async () => {
    await expect(contract.connect(developer).setListingPrice(99n, 1n))
      .to.be.revertedWithCustomError(contract, 'TokenDoesNotExist')
  })
})
