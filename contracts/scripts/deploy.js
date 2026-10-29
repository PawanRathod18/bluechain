const fs = require('fs')
const path = require('path')
const hre = require('hardhat')

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  const balance = await hre.ethers.provider.getBalance(deployer.address)
  console.log('Deploying CarbonCreditNFT')
  console.log('  network :', hre.network.name)
  console.log('  deployer:', deployer.address)
  console.log('  balance :', hre.ethers.formatEther(balance), 'ETH')

  const factory = await hre.ethers.getContractFactory('CarbonCreditNFT')
  const contract = await factory.deploy()
  await contract.waitForDeployment()

  const address = await contract.getAddress()
  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId)

  console.log('\nCarbonCreditNFT deployed to:', address)
  console.log('Chain id:', chainId)
  console.log('\nAdd to your .env:')
  console.log(`  CONTRACT_ADDRESS=${address}`)
  console.log(`  VITE_CONTRACT_ADDRESS=${address}`)

  const outDir = path.join(__dirname, '..', 'deployments')
  fs.mkdirSync(outDir, { recursive: true })
  const record = {
    contract: 'CarbonCreditNFT',
    address,
    chainId,
    network: hre.network.name,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  }
  fs.writeFileSync(path.join(outDir, `${hre.network.name}.json`), JSON.stringify(record, null, 2))
  console.log('\nDeployment record written to deployments/' + hre.network.name + '.json')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
