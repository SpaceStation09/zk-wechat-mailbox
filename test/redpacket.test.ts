import { SnapshotRestorer, takeSnapshot } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import chalk from "chalk";
import { BigNumberish, keccak256, parseEther, Signer, toUtf8Bytes, ZeroAddress, zeroPadValue } from "ethers";
import hre from "hardhat";
import { DKIMRegistry, Verifier, ZKRedpacket } from "../types";
import {
  Signals,
  signals,
  tencentDKIMPubkeyHash,
  testRecipient,
  twitterDKIMPubkeyHash,
  verifiedRecipient,
} from "./constants";
import { generateCalldata } from "./generateCalldata";

const log = console.log;
const info = chalk.hex("3093fd");
describe("Redpacket Test", () => {
  // let signers: WalletClient[];
  let deployer: Signer;
  let user: Signer;
  let rp: ZKRedpacket;
  let dkim: DKIMRegistry;
  let verifier: Verifier;
  let proof: BigNumberish[];
  let snapshot: SnapshotRestorer;
  const domain = "tencent.com";

  before(async () => {
    log(info("    Test setup phase may take some time since it needs to generate proof data in advance... Est. 1min"));
    [deployer, user] = await hre.ethers.getSigners();
    proof = await generateCalldata();
    dkim = await hre.ethers.deployContract("DKIMRegistry", [await deployer.getAddress()]);
    await dkim.setDKIMPublicKeyHash("tencent.com", tencentDKIMPubkeyHash);

    verifier = await hre.ethers.deployContract("Verifier");
    rp = await hre.ethers.deployContract("ZKRedpacket", [await verifier.getAddress(), await dkim.getAddress()]);
  });

  beforeEach(async () => {
    snapshot = await takeSnapshot();
  });

  afterEach(async () => {
    await snapshot.restore();
  });

  it("normal workflow", async () => {
    const seed = keccak256(toUtf8Bytes("test"));
    await rp.createPacket(10, false, 1800, seed, 0, ZeroAddress, parseEther("1"), { value: parseEther("1") });
    const creationSuccessEvent = (await rp.queryFilter(rp.filters.CreationSuccess()))[0];
    const rpId = creationSuccessEvent.args.id;

    const balanceBefore = await hre.ethers.provider.getBalance(verifiedRecipient);
    await rp.claim(rpId, verifiedRecipient, domain, proof, signals);
    const balanceAfterClaim = await hre.ethers.provider.getBalance(verifiedRecipient);

    expect(balanceAfterClaim - balanceBefore).to.be.eq(parseEther("0.1"));
    const claimSuccessEvent = (await rp.queryFilter(rp.filters.ClaimSuccess()))[0];
    const claimId = claimSuccessEvent.args.id;
    const claimedToken = claimSuccessEvent.args.claimedAmount;
    const tokenAddr = claimSuccessEvent.args.tokenAddress;
    expect(claimId).to.be.eq(rpId);
    expect(claimedToken).to.be.eq(parseEther("0.1"));
    expect(tokenAddr).to.be.eq(ZeroAddress);

    let { balance, pktNumber, claimedPkts, expired, claimedAmount } = await rp.checkAvailability(
      rpId,
      verifiedRecipient,
    );
    expect(balance).to.be.eq(parseEther("0.9"));
    expect(pktNumber).to.be.eq(10);
    expect(claimedPkts).to.be.eq(1);
    expect(expired).to.be.eq(false);
    expect(claimedAmount).to.be.eq(parseEther("0.1"));
  });

  it("claim will fail if the recipient is not committed in zk", async () => {
    const seed = keccak256(toUtf8Bytes("test"));
    await rp.createPacket(10, false, 1800, seed, 0, ZeroAddress, parseEther("1"), { value: parseEther("1") });
    const creationSuccessEvent = (await rp.queryFilter(rp.filters.CreationSuccess()))[0];
    const rpId = creationSuccessEvent.args.id;

    await expect(rp.claim(rpId, user.getAddress(), domain, proof, signals)).to.be.revertedWith("Invalid recipient");
    let modifiedSig: Signals = [signals[0], signals[1], zeroPadValue(await user.getAddress(), 32)];
    await expect(rp.claim(rpId, user.getAddress(), domain, proof, modifiedSig)).to.be.revertedWith("Invalid ZK proof");
  });

  it("claim will fail if the domain is not valid", async () => {
    const seed = keccak256(toUtf8Bytes("test"));
    await rp.createPacket(10, false, 1800, seed, 0, ZeroAddress, parseEther("1"), { value: parseEther("1") });
    const creationSuccessEvent = (await rp.queryFilter(rp.filters.CreationSuccess()))[0];
    const rpId = creationSuccessEvent.args.id;

    await expect(rp.claim(rpId, verifiedRecipient, "x.com", proof, signals)).to.be.revertedWith("Invalid Domain");

    await dkim.setDKIMPublicKeyHash("x.com", twitterDKIMPubkeyHash);
    let modifiedSig: Signals = [zeroPadValue(twitterDKIMPubkeyHash, 32), signals[1], signals[2]];
    await expect(rp.claim(rpId, verifiedRecipient, "x.com", proof, modifiedSig)).to.be.revertedWith("Invalid ZK proof");
  });

  it("claim will fail if the username is used before", async () => {
    const seed = keccak256(toUtf8Bytes("test"));
    await rp.createPacket(10, false, 1800, seed, 0, ZeroAddress, parseEther("1"), { value: parseEther("1") });
    const creationSuccessEvent = (await rp.queryFilter(rp.filters.CreationSuccess()))[0];
    const rpId = creationSuccessEvent.args.id;

    await rp.claim(rpId, verifiedRecipient, domain, proof, signals);

    log(info("    Test proof for current case generating... Est. 1min"));
    const testProof = await generateCalldata(true);
    const modifiedSig: Signals = [signals[0], signals[1], zeroPadValue(testRecipient, 32)];
    await expect(rp.claim(rpId, testRecipient, domain, testProof, modifiedSig)).to.be.revertedWith(
      "This username already used",
    );
  });
});
