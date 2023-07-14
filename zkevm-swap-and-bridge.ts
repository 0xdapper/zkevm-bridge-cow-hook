import { ethers } from "ethers";
import minimist from "minimist";
import erc20Abi from "./abis/ERC20.json";
import zkevmBridgerAbi from "./abis/ZkEVMBridger.json";
import {
  EcdsaSigningScheme,
  OrderBookApi,
  OrderKind,
  OrderSigningUtils,
  SigningScheme,
  SupportedChainId,
} from "@cowprotocol/cow-sdk";

import {
  Account,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  parseUnits,
} from "viem";
import { goerli, mainnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const assertDefined = (args: { [key: string]: any }) => {
  Object.entries(args).forEach(([key, value]) => {
    if (value === undefined) {
      throw new Error(`Missing argument ${key}`);
    }
  });
};

const zkEVMBridgeAddress = "0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe";
const vaultRelayerAddress = "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110";
const MAX_UINT = 2n ** 256n - 1n;
// TODO: fix this
const zkevmBridgerAddress = "0x8866d74b2dFf96DC4cbCb11e70ed54b432EE8c3B";

const approveIfNotApproved = async (
  client: ReturnType<typeof createPublicClient>,
  walletClient: ReturnType<typeof createWalletClient>,
  token: string,
  account: Account,
  amount: BigInt
) => {
  const allowance = (await client.readContract({
    address: token as `0x${string}`,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, vaultRelayerAddress],
  })) as BigInt;
  console.log("Current allowance: ", allowance.toString());
  if (allowance < amount) {
    const setAllowanceTxHash = await walletClient.writeContract({
      address: token as `0x${string}`,
      abi: erc20Abi,
      functionName: "approve",
      args: [vaultRelayerAddress, MAX_UINT],
      account,
      chain: mainnet,
    });
    return setAllowanceTxHash;
  }
};

const main = async () => {
  const rpcUrl = "https://eth.llamarpc.com";
  // const rpcUrl = "https://ethereum-goerli.publicnode.com";
  const transport = http(rpcUrl);
  const client = createPublicClient({
    chain: mainnet,
    transport,
  });

  // cli arguments
  const startIndex =
    process.argv.findIndex((x) => x.includes(module.filename)) + 1;
  const args = minimist(process.argv.slice(startIndex), {
    string: ["privateKey", "fromToken", "toToken", "inputAmount"],
  });
  const { privateKey, fromToken, toToken, inputAmount } = args;
  assertDefined({ privateKey, fromToken, toToken, inputAmount });

  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    transport,
  });
  const cowChainId = SupportedChainId.MAINNET;

  const fromTokenDecimals = (await client.readContract({
    abi: erc20Abi,
    functionName: "decimals",
    address: fromToken,
  })) as number;
  const fromTokenAmount = parseUnits(inputAmount, fromTokenDecimals);

  const approveTx = await approveIfNotApproved(
    client,
    walletClient,
    fromToken,
    account,
    fromTokenAmount
  );
  if (approveTx !== undefined) {
    const txReceipt = await client.waitForTransactionReceipt({
      hash: approveTx,
    });
    console.log("Approve tx receipt: ", txReceipt);
  }

  const approveHook = {
    target: toToken,
    callData: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [zkEVMBridgeAddress, MAX_UINT],
    }),
    gasLimit: (200000).toString(),
  };

  const bridgeHook = {
    target: zkevmBridgerAddress,
    callData: encodeFunctionData({
      abi: zkevmBridgerAbi,
      functionName: "bridgeToken",
      args: [toToken, account.address],
    }),
    gasLimit: (1_000_000).toString(),
  };

  const orderBookApi = new OrderBookApi({ chainId: cowChainId });
  const orderData = {
    kind: OrderKind.SELL as unknown as Parameters<
      typeof orderBookApi.getQuote
    >[0]["kind"],
    sellToken: fromToken,
    buyToken: toToken,
    sellAmountBeforeFee: fromTokenAmount.toString(),
    from: account.address,
    validTo: Math.floor(new Date().getTime() / 1000 + 3600),
    appData: JSON.stringify({
      backend: { hooks: { post: [approveHook, bridgeHook], pre: [] } },
    }),
    receiver: zkevmBridgerAddress,
  };
  console.log("Order data: ", orderData);
  const quoteResponse = await orderBookApi.getQuote(orderData);
  // console.log({ quoteResponse });

  console.log("Quote response: ", quoteResponse);
  const signedOrder = await OrderSigningUtils.signOrder(
    {
      ...quoteResponse.quote,
      appData: ethers.utils.id(quoteResponse.quote.appData),
      receiver: quoteResponse.quote.receiver!,
    },
    cowChainId,
    new ethers.Wallet(privateKey)
  );

  const sentOrder = await orderBookApi.sendOrder({
    ...quoteResponse.quote,
    signature: signedOrder.signature,
    signingScheme:
      signedOrder.signingScheme === EcdsaSigningScheme.EIP712
        ? SigningScheme.EIP712
        : SigningScheme.ETHSIGN,
  });

  console.log("Sent order: ", sentOrder);
  console.log(
    "Explorer URL: ",
    `https://explorer.cow.fi/orders/${sentOrder}?tab=overview`
  );
};

main();
