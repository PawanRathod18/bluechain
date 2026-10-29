/**
 * Offline compiler.
 *
 * `npx hardhat compile` downloads a solc binary from binaries.soliditylang.org.
 * On networks where that download is blocked, this script compiles with the
 * solc-js package installed from npm and writes Hardhat-compatible artifacts.
 *
 *   node scripts/compile-offline.js
 *   npx hardhat test --no-compile
 */
const fs = require('fs')
const path = require('path')
const solc = require('solc')

const ROOT = path.join(__dirname, '..')
const SOURCE = 'contracts/CarbonCreditNFT.sol'
const content = fs.readFileSync(path.join(ROOT, SOURCE), 'utf8')

function findImports(importPath) {
  const candidates = [
    path.join(ROOT, 'node_modules', importPath),
    path.join(ROOT, importPath),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return { contents: fs.readFileSync(c, 'utf8') }
  }
  return { error: 'File not found: ' + importPath }
}

const input = {
  language: 'Solidity',
  sources: { [SOURCE]: { content } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'cancun',
    outputSelection: {
      '*': {
        '*': [
          'abi',
          'evm.bytecode.object',
          'evm.bytecode.linkReferences',
          'evm.deployedBytecode.object',
          'evm.deployedBytecode.linkReferences',
        ],
      },
    },
  },
}

console.log('solc', solc.version())
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }))

const errors = (output.errors || []).filter((e) => e.severity === 'error')
if (errors.length) {
  errors.forEach((e) => console.error(e.formattedMessage))
  process.exit(1)
}
;(output.errors || []).forEach((e) => console.warn(e.formattedMessage.trim()))

const outDir = path.join(ROOT, 'artifacts', 'contracts', 'CarbonCreditNFT.sol')
fs.mkdirSync(outDir, { recursive: true })

for (const [name, contract] of Object.entries(output.contracts[SOURCE])) {
  const artifact = {
    _format: 'hh-sol-artifact-1',
    contractName: name,
    sourceName: SOURCE,
    abi: contract.abi,
    bytecode: '0x' + contract.evm.bytecode.object,
    deployedBytecode: '0x' + contract.evm.deployedBytecode.object,
    linkReferences: contract.evm.bytecode.linkReferences,
    deployedLinkReferences: contract.evm.deployedBytecode.linkReferences,
  }
  fs.writeFileSync(path.join(outDir, name + '.json'), JSON.stringify(artifact, null, 2))
  console.log('wrote artifacts/contracts/CarbonCreditNFT.sol/' + name + '.json')
}
