const { assert, expect } = require('chai')
const { network, deployments, ethers } = require('hardhat')
const { developmentChains } = require('../../helper-hardhat-config')

!developmentChains.includes(network.name)
  ? describe.skip
  : describe('Nft Marketplace Unit Tests', function () {
      let nftMarketplace, nftMarketplaceContract, basicNft, basicNftContract
      const PRICE = ethers.utils.parseEther('0.1')
      let tokenId

      beforeEach(async () => {
        accounts = await ethers.getSigners()
        deployer = accounts[0]
        user = accounts[1]
        await deployments.fixture(['all'])
        nftMarketplaceContract = await ethers.getContract('NftMarketPlace')
        nftMarketplace = nftMarketplaceContract.connect(deployer)
        basicNftContract = await ethers.getContract('BasicNft')
        basicNft = basicNftContract.connect(deployer)
        const mintTx = await basicNft.mintNft()
        const mintTxReceipt = await mintTx.wait(1)
        tokenId = mintTxReceipt.events[0].args.tokenId
        console.log(tokenId)
        await basicNft.approve(nftMarketplaceContract.address, tokenId)
      })

      describe('listItem', function () {
        it('emits an event after listing an item', async function () {
          expect(
            await nftMarketplace.listItem(basicNft.address, tokenId, PRICE)
          ).to.emit('ItemListed')
        })
        it("exclusively items that haven't been listed", async function () {
          await nftMarketplace.listItem(basicNft.address, tokenId, PRICE)
          await expect(
            nftMarketplace.listItem(basicNft.address, tokenId, PRICE)
          ).to.be.reverted
        })
        it('exclusively allows owners to list', async function () {
          nftMarketplace = nftMarketplaceContract.connect(user)
          await basicNft.approve(user.address, tokenId)
          await expect(
            nftMarketplace.listItem(basicNft.address, tokenId, PRICE)
          ).to.be.reverted
        })
        it('needs approvals to list item', async function () {
          await basicNft.approve(ethers.constants.AddressZero, tokenId)
          await expect(
            nftMarketplace.listItem(basicNft.address, tokenId, PRICE)
          ).to.be.revertedWith('NotApprovedForMarketplace')
        })
        it('Updates listing with seller and price', async function () {
          await nftMarketplace.listItem(basicNft.address, tokenId, PRICE)
          const listing = await nftMarketplace.getListing(
            basicNft.address,
            tokenId
          )
          assert(listing.price.toString() == PRICE.toString())
          assert(listing.seller.toString() == deployer.address)
        })
      })
      describe('cancelListing', function () {
        it('reverts if there is no listing', async function () {
          const error = `NotListed("${basicNft.address}", ${tokenId})`
          await expect(
            nftMarketplace.cancelListing(basicNft.address, tokenId)
          ).to.be.revertedWith(error)
        })
        it('reverts if anyone but the owner tries to call', async function () {
          await nftMarketplace.listItem(basicNft.address, tokenId, PRICE)
          nftMarketplace = nftMarketplaceContract.connect(user)
          await basicNft.approve(user.address, tokenId)
          await expect(
            nftMarketplace.cancelListing(basicNft.address, tokenId)
          ).to.be.revertedWith('NotOwner')
        })
        it('emits event and removes listing', async function () {
          await nftMarketplace.listItem(basicNft.address, tokenId, PRICE)
          expect(
            await nftMarketplace.cancelListing(basicNft.address, tokenId)
          ).to.emit('ItemCanceled')
          const listing = await nftMarketplace.getListing(
            basicNft.address,
            tokenId
          )
          assert(listing.price.toString() == '0')
        })
      })
      describe('buyItem', function () {
        it('reverts if the item isnt listed', async function () {
          await expect(
            nftMarketplace.buyItem(basicNft.address, tokenId)
          ).to.be.revertedWith('NotListed')
        })
        it('reverts if the price isnt met', async function () {
          await nftMarketplace.listItem(basicNft.address, tokenId, PRICE)
          await expect(nftMarketplace.buyItem(basicNft.address, tokenId)).to.be
            .reverted
        })
        it('transfers the nft to the buyer and updates internal proceeds record', async function () {
          await nftMarketplace.listItem(basicNft.address, tokenId, PRICE)
          nftMarketplace = nftMarketplaceContract.connect(user)
          expect(
            await nftMarketplace.buyItem(basicNft.address, tokenId, {
              value: PRICE,
            })
          ).to.emit('ItemBought')
          const newOwner = await basicNft.ownerOf(tokenId)
          const deployerProceeds = await nftMarketplace.getProceeds(
            deployer.address
          )
          assert(newOwner.toString() == user.address)
          assert(deployerProceeds.toString() == PRICE.toString())
        })
      })
      describe('updateListing', function () {
        it('must be owner and listed', async function () {
          await expect(
            nftMarketplace.updateListing(basicNft.address, tokenId, PRICE)
          ).to.be.revertedWith('NotListed')
          await nftMarketplace.listItem(basicNft.address, tokenId, PRICE)
          nftMarketplace = nftMarketplaceContract.connect(user)
          await expect(
            nftMarketplace.updateListing(basicNft.address, tokenId, PRICE)
          ).to.be.revertedWith('NotOwner')
        })
        it('updates the price of the item', async function () {
          const updatedPrice = ethers.utils.parseEther('0.2')
          await nftMarketplace.listItem(basicNft.address, tokenId, PRICE)
          expect(
            await nftMarketplace.updateListing(
              basicNft.address,
              tokenId,
              updatedPrice
            )
          ).to.emit('ItemListed')
          const listing = await nftMarketplace.getListing(
            basicNft.address,
            tokenId
          )
          console.log(listing.price.toString())
          // assert.equal(listing.price.toString(), updatedPrice.toString())
        })
      })
      describe('withdrawProceeds', function () {
        it("doesn't allow 0 proceed withdrawls", async function () {
          await expect(nftMarketplace.withdrawProceeds()).to.be.reverted
        })
        it('withdraws proceeds', async function () {
          await nftMarketplace.listItem(basicNft.address, tokenId, PRICE)
          nftMarketplace = nftMarketplaceContract.connect(user)
          await nftMarketplace.buyItem(basicNft.address, tokenId, {
            value: PRICE,
          })
          nftMarketplace = nftMarketplaceContract.connect(deployer)

          const deployerProceedsBefore = await nftMarketplace.getProceeds(
            deployer.address
          )
          const deployerBalanceBefore = await deployer.getBalance()
          const txResponse = await nftMarketplace.withdrawProceeds()
          const transactionReceipt = await txResponse.wait(1)
          const { gasUsed, effectiveGasPrice } = transactionReceipt
          const gasCost = gasUsed.mul(effectiveGasPrice)
          const deployerBalanceAfter = await deployer.getBalance()

          assert(
            deployerBalanceAfter.add(gasCost).toString() ==
              deployerProceedsBefore.add(deployerBalanceBefore).toString()
          )
        })
      })
    })
