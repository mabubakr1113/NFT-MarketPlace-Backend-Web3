const { networkConfig, developmentChains } = require('../helper-hardhat-config')
const { network } = require('hardhat')
const { verify } = require('../utils/verify')
require('dotenv').config()

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy, log } = deployments
  const { deployer } = await getNamedAccounts()
  const chainId = network.config.chainId

  const args = []
  const NftMarketPlace = await deploy('NftMarketPlace', {
    from: deployer,
    args: args,
    log: true,
  })
  log(`NFTMarketPlace deployed at ${NftMarketPlace.address}`)
  if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API) {
    log('Waiting to Verify....')
    await verify(NftMarketPlace.address, [])
    log('Contract Verified')
  }
}

module.exports.tags = ['all', 'marketplace']
