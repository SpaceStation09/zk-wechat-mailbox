import { SnapshotRestorer, takeSnapshot } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import chalk from "chalk";
import { BigNumberish, Signer } from "ethers";
import hre from "hardhat";
import { DKIMRegistry, Verifier, ZKRedpacket } from "../types";
import { tencentDKIMPubkeyHash } from "./constants";
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

  before(async () => {
    log(info("Test setup phase may take some time since it needs to generate proof data in advance...\n"));
    [deployer, user] = await hre.ethers.getSigners();
    proof = await generateCalldata();
    console.log(proof);
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

  it("normal workflow", async () => {});
});
