# zkEVM bridge CoW hook

This repo contains a script that will create a cowswap order with
post-hooks that will bridge the swapped tokens to Polygon ZkEVM L2 network.

```bash
yarn ts-node zkevm-swap-and-bridge.ts \
  --privateKey $PRIVATE_KEY \
  --fromToken <FROM_TOKEN> \
  --toToken <TO_TOKEN> \
  --inputAmount <INPUT_AMOUNT>
```

It will create a cowswap order with `receiver` set to the [`ZkEVMBridger`](./src/ZkEVMBridger.sol)
address. And in the post hook `bridgeToken` method gets called with
user's output token and user's address as receiver for the bridged assets.
