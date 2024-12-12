import "@nomicfoundation/hardhat-toolbox";
import { getHardhatNetworkConfig, HardhatGasReporterConfig } from "./SmartContractProjectConfig/config";

let networks = getHardhatNetworkConfig();
let solidity = {
  version: "0.8.20",
  settings: {
    viaIR: true,
    optimizer: {
      enabled: true,
      runs: 200,
      details: {
        yulDetails: {
          optimizerSteps: "u",
        },
      },
    },
  },
};
const gasReporter = HardhatGasReporterConfig;

const config = {
  networks,
  solidity,
  gasReporter,
  mocha: {
    timeout: 100000000,
  },
  typechain: {
    outDir: "types",
    target: "ethers-v6",
    alwaysGenerateOverloads: false,
  },
};

export default config;
