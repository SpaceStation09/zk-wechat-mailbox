import { SnapshotRestorer, takeSnapshot } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import chalk from "chalk";
import { BigNumberish, keccak256, parseEther, Signer, toUtf8Bytes, ZeroAddress } from "ethers";
import hre from "hardhat";
import { DKIMRegistry, Verifier, ZKRedpacket } from "../types";
import { signals, tencentDKIMPubkeyHash, verifiedRecipient } from "./constants";
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
});
