# Hardhat Template

To develop a hardhat contract project, we always need some frequently used dependencies which are not included in the basic hardhat project. Furthermore, we also need several tools to unify the coding style between collaborative workers. In fact, these pre-requisite are always configured similarly in different projects. So, I established this template to help us start a hardhat project in a more convenient way.

## Start

### Install dependencies

```shell
npm install
```

### Commands

#### Compile & Generate Types

```shell
npm run compile
```

#### Test

```shell
npm run test
```

#### Deploy Contract

Currently, we use [Hardhat Ignition](https://hardhat.org/ignition/docs/getting-started#overview) to help deploy & verify contract.

```shell
npx hardhat ignition deploy ./ignition/modules/[YOUR_DEPLOY_MODULE].ts --network <your-network>
```

### Get extensions

Recommend extensions are listed in the file `./.vscode/extensions.json`. If you go to vscode extension list, you could see all recommended extensions directly.

### Final step

Now you can start your development!

## Contribute

Any contribution is welcomed to make it better.

If you have any questions, please create an [issue](https://github.com/SpaceStation09/hardhat-template/issues).

**Enjoy!**
