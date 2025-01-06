# zk redpacket wechat

本项目基于 [`zk-email`](https://docs.zk.email/zk-email-verifier/), 搭建了一个需要微信身份认证的红包应用。 用户通过 zkp 证明自己持有一个 wechat 账户即可领取一个 onchain 的红包。

## 设计

### circuit

circuit 方面会包含如下 component：

- 对于`tencent.com`发出的 email 的验证(dkim signature).
- 解析出特定 regex 匹配到的邮件中的用户的 wechat username。
- 将 `ethereum address` 添加到 circuit 中, 这将以 input signal 的形式，但我们目前无需为其施加约束。这相当于我们只是在 proof 的生成过程中 commit 了这个 ethereum address。

### 合约

zk-wechat-redpacket 是基于原始的[普通红包合约](https://github.com/DimensionDev/RedPacket/blob/master/contracts/redpacket.sol)设计的，只是针对 zk 的逻辑增加了验证，以及一些代码优化。

**发红包**：

- 接受 Native Token 和 ERC20 Token 两种类型的代币
- 支持设置红包类型：均分型红包 和 随机型红包
- 需要设置红包的过期时间，有效期内可以领取红包，**过期后**红包的创建者才可以收回没有发完的红包。

**领红包**：

- 用户需要在与合约交互前，先需要生成 zk proof of wechat，其中 proof 中需要 commit 他用于接受红包的地址。
- 领完红包后，已经验证过的 wechat username 会被标记为已经领取过，这样这个微信号就不可以再领取该红包了。
- 需要注意的是，这里特意设计了 proof 的通用性的情况，对于相同的`domain`和`recipient address`，用户无需重复生成 proof。 如果需要考虑其专用性，那么需要在 circuit 中添加`packetId`之类的参数。
