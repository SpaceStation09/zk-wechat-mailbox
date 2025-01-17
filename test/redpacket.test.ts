import { SnapshotRestorer, takeSnapshot } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import chalk from "chalk";
import {
  AbiCoder,
  BigNumberish,
  keccak256,
  parseEther,
  Signer,
  solidityPacked,
  toBeHex,
  toUtf8Bytes,
  ZeroAddress,
  zeroPadValue,
} from "ethers";
import hre, { ethers, network } from "hardhat";
import { DKIMRegistry, MailboxFactory, Verifier, ZKRedpacket } from "../types";
import { calculateRecipient, Signals, signals, tencentDKIMPubkeyHash } from "./constants";
import { generateCalldata } from "./generateCalldata";

const log = console.log;
const info = chalk.hex("3093fd");
describe("Redpacket Test", () => {
  let deployer: Signer;
  let user: Signer;
  let rp: ZKRedpacket;
  let mailboxFactory: MailboxFactory;
  let dkim: DKIMRegistry;
  let verifier: Verifier;
  let proof: BigNumberish[];
  let withdrawProof: BigNumberish[];
  let snapshot: SnapshotRestorer;
  let mailBoxInitCode: string;
  let recipient: string;
  const domain = "tencent.com";
  const seed = keccak256(toUtf8Bytes("test"));

  before(async () => {
    log(info("    Test setup phase may take some time since it needs to generate proof data in advance... Est. 2min"));
    [deployer, user] = await hre.ethers.getSigners();
    dkim = await hre.ethers.deployContract("DKIMRegistry", [await deployer.getAddress()]);
    await dkim.setDKIMPublicKeyHash(domain, tencentDKIMPubkeyHash);

    verifier = await hre.ethers.deployContract("Verifier");
    mailboxFactory = await hre.ethers.deployContract("MailboxFactory", [
      await verifier.getAddress(),
      await dkim.getAddress(),
    ]);
    rp = await hre.ethers.deployContract("ZKRedpacket", [
      await verifier.getAddress(),
      await dkim.getAddress(),
      await mailboxFactory.getAddress(),
    ]);

    const creationCode = (await ethers.getContractFactory("TokenMailbox")).bytecode;
    const args = AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "bytes32"],
      [await verifier.getAddress(), await dkim.getAddress(), toBeHex(signals[1])],
    );
    mailBoxInitCode = solidityPacked(["bytes", "bytes"], [creationCode, args]);
    recipient = calculateRecipient(await mailboxFactory.getAddress(), mailBoxInitCode);
    proof = await generateCalldata(recipient);
    const userAddress = await user.getAddress();
    withdrawProof = await generateCalldata(userAddress);
  });

  beforeEach(async () => {
    snapshot = await takeSnapshot();
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  it("normal workflow", async () => {
    signals[2] = zeroPadValue(recipient, 32);
    await rp.createPacket(10, false, 1800, seed, "name", "Best Wishes", 0, ZeroAddress, parseEther("1"), {
      value: parseEther("1"),
    });

    const creationSuccessEvent = (await rp.queryFilter(rp.filters.CreationSuccess()))[0];
    const rpId = creationSuccessEvent.args.id;
    const balanceBefore = await hre.ethers.provider.getBalance(recipient);
    await rp.claim(rpId, proof, signals);
    const balanceAfterClaim = await hre.ethers.provider.getBalance(recipient);
    expect(balanceAfterClaim - balanceBefore).to.be.eq(parseEther("0.1"));
    const claimSuccessEvent = (await rp.queryFilter(rp.filters.ClaimSuccess()))[0];
    const claimId = claimSuccessEvent.args.id;
    const claimedToken = claimSuccessEvent.args.claimedAmount;
    const tokenAddr = claimSuccessEvent.args.tokenAddress;
    expect(claimId).to.be.eq(rpId);
    expect(claimedToken).to.be.eq(parseEther("0.1"));
    expect(tokenAddr).to.be.eq(ZeroAddress);
    let { balance, pktNumber, claimedPkts, expired, claimedAmount } = await rp.checkAvailability(rpId, recipient);
    expect(balance).to.be.eq(parseEther("0.9"));
    expect(pktNumber).to.be.eq(10);
    expect(claimedPkts).to.be.eq(1);
    expect(expired).to.be.eq(false);
    expect(claimedAmount).to.be.eq(parseEther("0.1"));
  });

  it("normal workflow for random mode", async () => {
    await rp.createPacket(10, true, 1800, seed, "name", "Best Wishes", 0, ZeroAddress, parseEther("1"), {
      value: parseEther("1"),
    });
    const creationSuccessEvent = (await rp.queryFilter(rp.filters.CreationSuccess()))[0];
    const rpId = creationSuccessEvent.args.id;

    const balanceBefore = await hre.ethers.provider.getBalance(recipient);
    await rp.claim(rpId, proof, signals);
    const balanceAfterClaim = await hre.ethers.provider.getBalance(recipient);
    expect(balanceAfterClaim).to.be.gt(balanceBefore);
    const received = balanceAfterClaim - balanceBefore;

    const claimSuccessEvent = (await rp.queryFilter(rp.filters.ClaimSuccess()))[0];
    const claimId = claimSuccessEvent.args.id;
    const claimedToken = claimSuccessEvent.args.claimedAmount;
    const tokenAddr = claimSuccessEvent.args.tokenAddress;
    expect(claimId).to.be.eq(rpId);
    expect(tokenAddr).to.be.eq(ZeroAddress);
    expect(received).to.be.eq(claimedToken);

    let { balance, pktNumber, claimedPkts, expired, claimedAmount } = await rp.checkAvailability(rpId, recipient);

    const remainingToken = parseEther("1") - received;
    expect(balance).to.be.eq(remainingToken);
    expect(pktNumber).to.be.eq(10);
    expect(claimedPkts).to.be.eq(1);
    expect(expired).to.be.eq(false);
    expect(claimedAmount).to.be.eq(received);
  });

  it("normal workflow with ERC20", async () => {
    const testToken = await hre.ethers.deployContract("TestToken", [parseEther("1000")]);
    await testToken.approve(await rp.getAddress(), parseEther("1000"));
    await rp.createPacket(
      10,
      false,
      1800,
      seed,
      "name",
      "Best Wishes",
      1,
      await testToken.getAddress(),
      parseEther("10"),
    );
    const creationSuccessEvent = (await rp.queryFilter(rp.filters.CreationSuccess()))[0];
    const rpId = creationSuccessEvent.args.id;

    const balanceBefore = await testToken.balanceOf(recipient);
    await rp.claim(rpId, proof, signals);
    const balanceAfterClaim = await testToken.balanceOf(recipient);

    expect(balanceAfterClaim - balanceBefore).to.be.eq(parseEther("1"));
    const claimSuccessEvent = (await rp.queryFilter(rp.filters.ClaimSuccess()))[0];
    const claimId = claimSuccessEvent.args.id;
    const claimedToken = claimSuccessEvent.args.claimedAmount;
    const tokenAddr = claimSuccessEvent.args.tokenAddress;
    expect(claimId).to.be.eq(rpId);
    expect(claimedToken).to.be.eq(parseEther("1"));
    expect(tokenAddr).to.be.eq(await testToken.getAddress());

    let { balance, pktNumber, claimedPkts, expired, claimedAmount } = await rp.checkAvailability(rpId, recipient);

    expect(balance).to.be.eq(parseEther("9"));
    expect(pktNumber).to.be.eq(10);
    expect(claimedPkts).to.be.eq(1);
    expect(expired).to.be.eq(false);
    expect(claimedAmount).to.be.eq(parseEther("1"));
  });

  it("claim will fail if the packet is expired", async () => {
    const testToken = await hre.ethers.deployContract("TestToken", [parseEther("1000")]);
    await testToken.approve(await rp.getAddress(), parseEther("1000"));
    await rp.createPacket(
      10,
      false,
      1800,
      seed,
      "name",
      "Best Wishes",
      1,
      await testToken.getAddress(),
      parseEther("10"),
    );
    const creationSuccessEvent = (await rp.queryFilter(rp.filters.CreationSuccess()))[0];
    const rpId = creationSuccessEvent.args.id;

    await network.provider.send("evm_increaseTime", [1801]);
    await expect(rp.claim(rpId, proof, signals)).to.be.revertedWith("Expired");
  });

  it("claim will fail if the packet is out of stock", async () => {
    const testToken = await hre.ethers.deployContract("TestToken", [parseEther("1000")]);
    await testToken.approve(await rp.getAddress(), parseEther("10"));
    await rp.createPacket(
      1,
      false,
      1800,
      seed,
      "name",
      "Best Wishes",
      1,
      await testToken.getAddress(),
      parseEther("10"),
    );
    const creationSuccessEvent = (await rp.queryFilter(rp.filters.CreationSuccess()))[0];
    const rpId = creationSuccessEvent.args.id;

    await rp.claim(rpId, proof, signals);
    await expect(rp.claim(rpId, proof, signals)).to.be.revertedWith("Out of stock");
  });

  it("claim will fail if the recipient is not committed in zk", async () => {
    await rp.createPacket(10, false, 1800, seed, "name", "Best Wishes", 0, ZeroAddress, parseEther("1"), {
      value: parseEther("1"),
    });
    const creationSuccessEvent = (await rp.queryFilter(rp.filters.CreationSuccess()))[0];
    const rpId = creationSuccessEvent.args.id;

    let modifiedSig: Signals = [signals[0], signals[1], zeroPadValue(await user.getAddress(), 32)];
    await expect(rp.claim(rpId, proof, modifiedSig)).to.be.revertedWith("Invalid recipient");

    // Changed last digit of signal[1]
    const modifiedName = "0x2ee1548c9e6de8d9fbb3fd2beec8483b933555c099843ee076bd77e188addc62";
    const creationCode = (await ethers.getContractFactory("TokenMailbox")).bytecode;
    const args = AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "bytes32"],
      [await verifier.getAddress(), await dkim.getAddress(), toBeHex(modifiedName)],
    );
    const newInitCode = solidityPacked(["bytes", "bytes"], [creationCode, args]);
    const modifiedRecipient = calculateRecipient(await mailboxFactory.getAddress(), newInitCode, modifiedName);
    modifiedSig = [signals[0], modifiedName, zeroPadValue(modifiedRecipient, 32)];
    await expect(rp.claim(rpId, proof, modifiedSig)).to.be.revertedWith("Invalid ZK proof");
  });

  it("withdraw token normal workflow", async () => {
    signals[2] = zeroPadValue(recipient, 32);
    await rp.createPacket(10, false, 1800, seed, "name", "Best Wishes", 0, ZeroAddress, parseEther("1"), {
      value: parseEther("1"),
    });
    const creationSuccessEvent = (await rp.queryFilter(rp.filters.CreationSuccess()))[0];
    const rpId = creationSuccessEvent.args.id;
    await rp.claim(rpId, proof, signals);

    await mailboxFactory.createMailbox(toBeHex(signals[1]));
    const deploySuccess = (await mailboxFactory.queryFilter(mailboxFactory.filters.MailboxDeployed()))[0];
    const mailboxAddr = deploySuccess.args.mailboxAddr;
    const mailbox = await ethers.getContractAt("TokenMailbox", recipient);
    expect(mailboxAddr).to.be.eq(recipient);

    const userAddress = await user.getAddress();
    const modifiedSig: Signals = [signals[0], signals[1], zeroPadValue(userAddress, 32)];

    const balanceBefore = await hre.ethers.provider.getBalance(userAddress);
    const mailboxBalance = await hre.ethers.provider.getBalance(mailboxAddr);
    await mailbox.withdrawToken(ZeroAddress, userAddress, withdrawProof, modifiedSig);
    const balanceAfterWithdraw = await hre.ethers.provider.getBalance(userAddress);
    expect(balanceAfterWithdraw - balanceBefore).to.be.eq(mailboxBalance);
    expect(mailboxBalance).to.be.eq(parseEther("0.1"));
  });

  it("withdraw erc20 token normal workflow", async () => {
    const testToken = await hre.ethers.deployContract("TestToken", [parseEther("1000")]);
    await testToken.approve(await rp.getAddress(), parseEther("1000"));
    await rp.createPacket(
      10,
      false,
      1800,
      seed,
      "name",
      "Best Wishes",
      1,
      await testToken.getAddress(),
      parseEther("10"),
    );
    const creationSuccessEvent = (await rp.queryFilter(rp.filters.CreationSuccess()))[0];
    const rpId = creationSuccessEvent.args.id;

    await rp.claim(rpId, proof, signals);

    await mailboxFactory.createMailbox(toBeHex(signals[1]));
    const deploySuccess = (await mailboxFactory.queryFilter(mailboxFactory.filters.MailboxDeployed()))[0];
    const mailboxAddr = deploySuccess.args.mailboxAddr;
    const mailbox = await ethers.getContractAt("TokenMailbox", recipient);
    expect(mailboxAddr).to.be.eq(recipient);

    const userAddress = await user.getAddress();
    const modifiedSig: Signals = [signals[0], signals[1], zeroPadValue(userAddress, 32)];

    const balanceBefore = await testToken.balanceOf(userAddress);
    const mailboxBalance = await testToken.balanceOf(mailboxAddr);
    await mailbox.withdrawToken(await testToken.getAddress(), userAddress, withdrawProof, modifiedSig);
    const balanceAfterWithdraw = await testToken.balanceOf(userAddress);
    expect(balanceAfterWithdraw - balanceBefore).to.be.eq(mailboxBalance);
    expect(mailboxBalance).to.be.eq(parseEther("1"));
  });

  describe("Refund test", () => {
    it("Normal refund workflow", async () => {
      signals[2] = zeroPadValue(recipient, 32);
      await rp.createPacket(10, false, 1800, seed, "name", "Best Wishes", 0, ZeroAddress, parseEther("1"), {
        value: parseEther("1"),
      });

      const creationSuccessEvent = (await rp.queryFilter(rp.filters.CreationSuccess()))[0];
      const rpId = creationSuccessEvent.args.id;
      await rp.claim(rpId, proof, signals);

      await network.provider.send("evm_increaseTime", [1801]);

      await rp.refund(rpId);
      const refundSuccessEvent = (await rp.queryFilter(rp.filters.RefundSuccess()))[0];
      const claimId = refundSuccessEvent.args.id;
      expect(claimId).to.be.eq(rpId);
      expect(refundSuccessEvent.args.tokenAddress).to.be.eq(ZeroAddress);
      expect(refundSuccessEvent.args.tokenAmount).to.be.eq(parseEther("0.9"));
    });

    it("Claim will fail if packet not expire", async () => {
      signals[2] = zeroPadValue(recipient, 32);
      await rp.createPacket(10, false, 1800, seed, "name", "Best Wishes", 0, ZeroAddress, parseEther("1"), {
        value: parseEther("1"),
      });

      const creationSuccessEvent = (await rp.queryFilter(rp.filters.CreationSuccess()))[0];
      const rpId = creationSuccessEvent.args.id;
      await rp.claim(rpId, proof, signals);

      await expect(rp.refund(rpId)).to.be.revertedWith("Not expired yet");
    });

    it("Claim will fail if packet is out of stock", async () => {
      signals[2] = zeroPadValue(recipient, 32);
      await rp.createPacket(1, false, 1800, seed, "name", "Best Wishes", 0, ZeroAddress, parseEther("1"), {
        value: parseEther("1"),
      });

      const creationSuccessEvent = (await rp.queryFilter(rp.filters.CreationSuccess()))[0];
      const rpId = creationSuccessEvent.args.id;
      await rp.claim(rpId, proof, signals);

      await network.provider.send("evm_increaseTime", [1801]);
      await expect(rp.refund(rpId)).to.be.revertedWith("Nothing left");
    });
  });
});
