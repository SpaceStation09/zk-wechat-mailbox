import { buildModule } from "@nomicfoundation/ignition-core";

const dkimRegistry = "0x3387a7e7B6A2ba6C2cE3482C14a5d6c6D1F03Ff5";
const verifier = "0xc3e62b2CC70439C32a381Bfc056aCEd1d7162cef";
const factory = "0x081ea6437E73F3b4504b131443309404a9bC2054";

const rpModule = buildModule("Redpacket", (m) => {
  const redpacket = m.contract("ZKRedpacket", [verifier, dkimRegistry, factory]);

  return { redpacket };
});

export default rpModule;
