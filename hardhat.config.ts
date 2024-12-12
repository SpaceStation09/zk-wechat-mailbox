import "@nomicfoundation/hardhat-toolbox";
import { HardhatUserConfig } from "hardhat/config";
import {
  getHardhatNetworkConfig,
  HardhatGasReporterConfig,
  HardhatSolidityConfig,
} from "./SmartContractProjectConfig/config";

let networks = getHardhatNetworkConfig();
let solidity = HardhatSolidityConfig;
solidity.version = "0.8.24";
const gasReporter = HardhatGasReporterConfig;

const config: HardhatUserConfig = {
  networks,
  solidity,
  gasReporter,
  typechain: {
    outDir: "types",
    target: "ethers-v6",
    alwaysGenerateOverloads: false,
  },
};

export default config;
