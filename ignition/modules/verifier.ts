import { buildModule } from "@nomicfoundation/ignition-core";
import { tencentDKIMPubkeyHash } from "../../test/constants";

const deployer = "0x8cAb42EF3c96Ca59f5C52E687197d9e54161831A";
const domain = "tencent.com";

const dkimRegistryModule = buildModule("zkVerifier", (m) => {
  const dkim = m.contract("DKIMRegistry", [deployer]);
  const verifier = m.contract("Verifier");

  m.call(dkim, "setDKIMPublicKeyHash", [domain, tencentDKIMPubkeyHash]);

  return { dkim, verifier };
});

export default dkimRegistryModule;
