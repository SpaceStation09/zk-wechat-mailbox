# zk redpacket wechat

本项目基于 [`zk-email`](https://docs.zk.email/zk-email-verifier/), 搭建了一个需要微信身份认证的红包应用。 用户通过 zkp 证明自己持有一个 wechat 账户即可领取一个 onchain 的红包。

## 设计

### circuit

circuit 方面会包含如下 component：

- 对于`tencent.com`发出的 email 的验证(dkim signature).
- 解析出特定 regex 匹配到的邮件中的用户的 wechat username。
- 将 `ethereum address` 添加到 circuit 中, 这将以 input signal 的形式，但我们目前无需为其施加约束。
