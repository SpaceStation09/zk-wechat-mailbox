import { buildModule } from "@nomicfoundation/ignition-core";

const dkimRegistry = "0x3387a7e7B6A2ba6C2cE3482C14a5d6c6D1F03Ff5";
const verifier = "0xc3e62b2CC70439C32a381Bfc056aCEd1d7162cef";

const factoryModule = buildModule("MailboxFactory", (m) => {
  const factory = m.contract("MailboxFactory", [verifier, dkimRegistry]);

  return { factory };
});

export default factoryModule;
