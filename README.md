# zk redpacket wechat

本项目基于 [`zk-email`](https://docs.zk.email/zk-email-verifier/), 搭建了一个需要微信身份认证的红包应用。 用户通过 zkp 证明自己持有一个 wechat 账户即可领取一个 onchain 的红包。

## 设计

详情可查看[Structure.md](docs/Structure.md)。

## Deployments

|  Chain  | RedPacket                | Mailbox Factory          | Verifier                | DKIM Registry              |
| :-----: | :----------------------- | ------------------------ | ----------------------- | -------------------------- |
| sepolia | [0x2cF46Db8][rp-sepolia] | [0x081ea643][mf-sepolia] | [0xc3e62b2C][v-sepolia] | [0x3387a7e7][dkim-sepolia] |

[rp-sepolia]: https://sepolia.etherscan.io/address/0x2cF46Db820e279c5fBF778367D49d9C931D54524#code
[mf-sepolia]: https://sepolia.etherscan.io/address/0x081ea6437E73F3b4504b131443309404a9bC2054#code
[v-sepolia]: https://sepolia.etherscan.io/address/0xc3e62b2CC70439C32a381Bfc056aCEd1d7162cef#code
[dkim-sepolia]: https://sepolia.etherscan.io/address/0x3387a7e7B6A2ba6C2cE3482C14a5d6c6D1F03Ff5#code
