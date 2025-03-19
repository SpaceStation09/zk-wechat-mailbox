import { BigNumberish, getCreate2Address, keccak256, toBeHex } from "ethers";

export const tencentDKIMPubkeyHash = "0x181ab950d973ee53838532ecb1b8b11528f6ea7ab08e2868fb3218464052f953";
export const twitterDKIMPubkeyHash = "0x20f1a7b899cd96e1cb783b1d141c2c6cc1ca55260aee5364b489fbbb8c39f5bf";

export const testRecipient = "0x8cAb42EF3c96Ca59f5C52E687197d9e54161831A";

export const signals: Signals = [
  "0x181ab950d973ee53838532ecb1b8b11528f6ea7ab08e2868fb3218464052f953",
  "0x2ee1548c9e6de8d9fbb3fd2beec8483b933555c099843ee076bd77e188addc6a",
  "0x00000000000000000000000094871d770973d93d6c8912e3d1950f3dad9b4e30",
];

export type Signals = [BigNumberish, BigNumberish, BigNumberish];

export function calculateRecipient(deployer: string, initCode: string, name?: BigNumberish): string {
  const nameSig = name ?? signals[1];
  const recipient = getCreate2Address(deployer, toBeHex(nameSig), keccak256(initCode));
  return recipient;
}
