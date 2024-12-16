import { BigNumberish } from "ethers";

export const tencentDKIMPubkeyHash = "0x181ab950d973ee53838532ecb1b8b11528f6ea7ab08e2868fb3218464052f953";
export const twitterDKIMPubkeyHash = "0x20f1a7b899cd96e1cb783b1d141c2c6cc1ca55260aee5364b489fbbb8c39f5bf";

export const verifiedRecipient = "0x94871d770973D93d6c8912E3D1950F3DAD9B4E30";
export const testRecipient = "0x8cAb42EF3c96Ca59f5C52E687197d9e54161831A";

export const signals: Signals = [
  "0x181ab950d973ee53838532ecb1b8b11528f6ea7ab08e2868fb3218464052f953",
  "0x000000000000000000000000000000000039306e6f69746174535f6563617053",
  "0x00000000000000000000000094871d770973d93d6c8912e3d1950f3dad9b4e30",
];

export type Signals = [BigNumberish, BigNumberish, BigNumberish];
