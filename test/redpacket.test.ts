import { SnapshotRestorer, takeSnapshot } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import chalk from "chalk";
import { BigNumberish, keccak256, parseEther, Signer, toUtf8Bytes, ZeroAddress, zeroPadValue } from "ethers";
import hre, { ethers } from "hardhat";
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
  let snapshot: SnapshotRestorer;
  let mailBoxInitCode: string;
  let recipient: string;
  const domain = "tencent.com";
  const seed = keccak256(toUtf8Bytes("test"));

  before(async () => {
    log(info("    Test setup phase may take some time since it needs to generate proof data in advance... Est. 1min"));
    [deployer, user] = await hre.ethers.getSigners();
    dkim = await hre.ethers.deployContract("DKIMRegistry", [await deployer.getAddress()]);
    await dkim.setDKIMPublicKeyHash("tencent.com", tencentDKIMPubkeyHash);

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

    mailBoxInitCode = (await ethers.getContractFactory("TokenMailbox")).bytecode;
    recipient = calculateRecipient(await mailboxFactory.getAddress(), mailBoxInitCode);
    proof = await generateCalldata(recipient);
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

  it("claim will fail if the recipient is not committed in zk", async () => {
    await rp.createPacket(10, false, 1800, seed, "name", "Best Wishes", 0, ZeroAddress, parseEther("1"), {
      value: parseEther("1"),
    });
    const creationSuccessEvent = (await rp.queryFilter(rp.filters.CreationSuccess()))[0];
    const rpId = creationSuccessEvent.args.id;

    let modifiedSig: Signals = [signals[0], signals[1], zeroPadValue(await user.getAddress(), 32)];
    await expect(rp.claim(rpId, proof, modifiedSig)).to.be.revertedWith("Invalid recipient");

    // Changed last digit of signal[1]
    const modifiedName = "0x000000000000000000000000000000000039306e6f69746174535f6563617052";
    const modifiedRecipient = calculateRecipient(await mailboxFactory.getAddress(), mailBoxInitCode, modifiedName);
    modifiedSig = [signals[0], modifiedName, zeroPadValue(modifiedRecipient, 32)];
    await expect(rp.claim(rpId, proof, modifiedSig)).to.be.revertedWith("Invalid ZK proof");
  });
});
