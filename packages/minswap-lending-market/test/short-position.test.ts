import invariant from "@minswap/tiny-invariant";
import { type BaseAddressWallet, baseAddressWalletFromSeed } from "@repo/cip";
import { Address, Asset, NetworkEnvironment, PrivateKey, Utxo, XJSON } from "@repo/ledger-core";
import { RustModule } from "@repo/ledger-utils";
import { beforeEach, test } from "vitest";
import { LendingMarket, LiqwidProvider, NitroWallet } from "../src";

let mockData: {
  wallet: BaseAddressWallet;
  nitroAddress: Address;
  qMinAsset: Asset;
  networkEnv: NetworkEnvironment;
  nitroWallet: NitroWallet.Wallet;
};

beforeEach(async () => {
  await RustModule.load();
  const networkEnv = NetworkEnvironment.TESTNET_PREVIEW;
  const wallet = baseAddressWalletFromSeed(
    "chief giggle into laptop alien crop return glide vintage flash control digital mutual tumble profit quarter discover unhappy blast case rural search stock east",
    networkEnv,
  );
  const utxos = await NitroWallet.fetchUtxos(wallet.address.bech32, networkEnv);
  mockData = {
    wallet,
    nitroAddress: Address.fromBech32(
      "addr_test1qp2t43hr6aktanylcpqngr98a3l2a8mpwt566r0yxtujj255cyxmu3jfgktsagvgyggy759khn808gxsaacaj0kmszkqw47mas",
    ),
    qMinAsset: Asset.fromString("186cd98a29585651c89f05807a876cf26cdf47a7f86f70be3b9e4cc0"),
    networkEnv,
    nitroWallet: {
      address: wallet.address,
      privateKey: wallet.paymentKey.toHex(),
      utxos: utxos.map(Utxo.toHex),
    },
  };
});

test.skip(
  "Short Position | Integration Test",
  async () => {
    const { nitroWallet, networkEnv } = mockData;
    const balance = Utxo.sumValue(nitroWallet.utxos.map(Utxo.fromHex));
    const { collaterals, buildTxCollaterals } = await LendingMarket.getCollaterals({
      balance,
      networkEnv,
      address: nitroWallet.address,
      collateralMode: {
        mode: LendingMarket.CollateralMode.ISOLATED_MARGIN,
        borrowMarketId: "MIN",
        supplyMarketId: "Ada",
      },
    });
    console.log(XJSON.stringify({ collaterals, buildTxCollaterals }, 2));
    const borrowTx = await LendingMarket.borrowTokens({
      nitroWallet,
      networkEnv,
      currentDebt: 0,
      collaterals,
      buildTxCollaterals,
      borrowMarketId: "MIN",
      dry: true,
      borrowAmountL: 3000000000,
    });
    console.log("Borrow TX:", borrowTx);
  },
  10 * 60000,
);

test.skip("repay", async () => {
  const { networkEnv } = mockData;
  const address = Address.fromBech32(
    "addr_test1qpgj3cr2texe2uwnzcpfz4xp88908ex8yjh4ky29gqcqht4a0akhzkfmycrwwyet4v4yf80q2p8788njtdmspgkjcslsl7x6k6",
  );
  const pubKeyHash = address.toPubKeyHash()?.keyHash.hex;
  invariant(pubKeyHash, "Failed to get pubKeyHash from nitro wallet address");
  const loans = await LiqwidProvider.getLoansBorrow({
    input: {
      paymentKeys: [pubKeyHash],
    },
    networkEnv,
  });
  console.log("Loans:", XJSON.stringify(loans, 2));
  const utxos = await NitroWallet.fetchRawUtxos(address.bech32, networkEnv);
  const data = await LendingMarket.repayAllDebt({
    nitroWallet: {
      address,
      privateKey: "ff",
      utxos,
    },
    networkEnv,
    dry: true,
  });
  console.log("Repay all debt TX:", data);
}, 5000);

test.skip("withdraw all supply", async () => {
  const { networkEnv } = mockData;
  const address = Address.fromBech32(
    "addr_test1qp5dnj7dke8p64q8sn6huyahk4p58ld5rd2zun0t9jpjd2lc5mx9td9j5ertnrspp7lpqt4r4h9zvzd7ddpf7kygtmcqqjk22c",
  );
  const utxos = await NitroWallet.fetchRawUtxos(address.bech32, networkEnv);
  const balance = await NitroWallet.fetchBalance(address.bech32, networkEnv);
  const qAda = Asset.fromString(LiqwidProvider.mapQAdaToken[networkEnv]);
  const supplyQTokenAmountA = Number(balance.get(qAda)) / 1e6;
  const withdrawAmount = await LendingMarket.calculateWithdrawAllAmountL({
    address: address,
    marketId: "Ada",
    networkEnv,
    qTokenAmountA: supplyQTokenAmountA,
  });
  console.log(withdrawAmount);
  const data = await LendingMarket.withdrawAllSupply({
    nitroWallet: {
      address,
      privateKey: "ff",
      utxos,
    },
    networkEnv,
    dry: true,
    marketId: "Ada",
    supplyQTokenAmountA,
  });
  console.log("Withdraw all supply TX:", data);
}, 5000);

test.skip("adhoc", async () => {
  const tx =
    "84ab0084825820aa64ac603b52b207e185d3a6fca342d8708c865cf39f08170d0515763b8191420082582099deafb0a04f3470986a5ea96d8b19ccc8ee0b1c653828f1c6eb93aa25e7a9290082582099deafb0a04f3470986a5ea96d8b19ccc8ee0b1c653828f1c6eb93aa25e7a929028258203fd6d83a76cb37dbe9de7a378014362b9dd4086e51abafc4eeb22d0a23c40d9b000183a300581d703a85e74973d226016bb10f39a0113708856af24408c69ee983f4f73001821a002dc6c0a2581c919d4c2c9455016289341b1a14dedf697687af31751170d56a31466ea144744d494e1b000000577dbd1524581ca609c1e386119f68c1d8c5a6555d3417fb10995cee7c8ae1f059d689a14001028201d818569f9f00003b0000000c4788e7753a06e3c94600ff13ff8258390068d9cbcdb64e1d540784f57e13b7b54343fdb41b542e4deb2c8326abf8a6cc55b4b2a646b98e010fbe102ea3adca2609be6b429f58885ef0821a001495a6a2581c50e015ec8204db83a4f57aa9ee40ce6ea157e3b7335a149fafe3f370a1401b0000000a3522a585581c919d4c2c9455016289341b1a14dedf697687af31751170d56a31466ea144744d494e1b00000006a7a7f7f98258390068d9cbcdb64e1d540784f57e13b7b54343fdb41b542e4deb2c8326abf8a6cc55b4b2a646b98e010fbe102ea3adca2609be6b429f58885ef01a0bd8c216021a0009545e031a05c3979a09a1581c5d935134129c7153acdba0953135d10c415694c36e3a19927a3ed360a14101200b5820ab46f79c22b93644b269dbedb017172d711a461aee039ddd0b6bba1d16da47aa0d8182582099deafb0a04f3470986a5ea96d8b19ccc8ee0b1c653828f1c6eb93aa25e7a929020e81581c68d9cbcdb64e1d540784f57e13b7b54343fdb41b542e4deb2c8326ab108258390068d9cbcdb64e1d540784f57e13b7b54343fdb41b542e4deb2c8326abf8a6cc55b4b2a646b98e010fbe102ea3adca2609be6b429f58885ef01a0b39cbab111a000dfe8d128582582096b66ae0305242974954dba9dd98dc0d6f6b992d2214648bc056cc7b167be9e800825820ebe2be53d8796d7b78c9354558999bdff459ddb821c73cbd9d6ccc22cbf2629300825820a83e7f0e5f0689c56da8f7ec950855da71f27e70e7423194b22af2f5e07a9e92018258208d511982a6e60cf39511555c525a4705374dfdce0093b0bb948f2017e8e8a79602825820f54a29f5470990e6d0aa1677089e89d67710e59a1e6e2bcb5dfb6ff43631329600a2049fd87980ff0583840001d87980821a00057d471a0777af8e840003d879808219b24a1a00f228d5840100d87980821a0013dac51a19ae030bf5f6";
  const _witnessSet = LiqwidProvider.signLiqwidTx(
    tx,
    PrivateKey.fromHex(
      "d8405840989c42e59a33873f3193fced5c513771b046d07a33e671c4e8aa4e96040d1947f5af8d89b6f2feb55f2022b5fbd084d0430a5ab3c6a3f71ef35d11279abd5055",
    ),
  );
  const txHash = await LiqwidProvider.submitTransaction({
    transaction: tx,
    networkEnv: NetworkEnvironment.TESTNET_PREVIEW,
    signature: "",
  });
  console.log("TX Hash:", txHash);
}, 4300);

test("get earned", async () => {
  const result = await LiqwidProvider.getYieldEarned({
    input: {
      addresses: [
        "addr_test1qpgj3cr2texe2uwnzcpfz4xp88908ex8yjh4ky29gqcqht4a0akhzkfmycrwwyet4v4yf80q2p8788njtdmspgkjcslsl7x6k6",
      ],
    },
    currency: "USD",
    networkEnv: NetworkEnvironment.TESTNET_PREVIEW,
  });

  if (result.type === "ok") {
    console.log(result.value.totalYieldEarned);
    console.log(result.value.markets);
  }
}, 5000);
