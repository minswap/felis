import invariant from "@minswap/tiny-invariant";
import { type BaseAddressWallet, baseAddressWalletFromSeed } from "@repo/cip";
import { Address, Asset, NetworkEnvironment, type PrivateKey, Utxo, XJSON } from "@repo/ledger-core";
import { blake2b256, Result, RustModule } from "@repo/ledger-utils";
import { beforeAll, describe, expect, it } from "vitest";
import { TxComplete } from "../../tx-builder/dist/tx-builder";
import { LendingMarket, LiqwidProvider, NitroWallet } from "../src";

// biome-ignore lint/suspicious/noExplicitAny: lazy
let mockData: {
  wallet: BaseAddressWallet;
  txHex: string;
  nitroAddress: Address;
  qMinAsset: Asset;
};

beforeAll(async () => {
  await RustModule.load();
  mockData = {
    wallet: baseAddressWalletFromSeed(
      "muffin spell cement resemble frame pupil grow gloom hawk wild item hungry polar ice maximum sport economy drop sun timber stone circle army jazz",
      NetworkEnvironment.TESTNET_PREVIEW,
    ),
    txHex:
      "84ab008482582053478bdd28ed27bd67fe6afba23f1f937d8e78f551f2de478fe72885bf2439f8028258209a1d9a4ef6fa81e112d2c919c60560231e03a2262843fdfcbaa5e55fe3aac6f000825820bbd3c155d22c918dc9137b73e868e419ec4bc4d6c07aa715222073f9c6d1bfde0082582005a5fe099267da09aaacfc113f241b60ddbe7e5d27909567e9a4924a565fc36d020183a300581d703a85e74973d226016bb10f39a0113708856af24408c69ee983f4f73001821a002dc6c0a2581c919d4c2c9455016289341b1a14dedf697687af31751170d56a31466ea144744d494e1b00000036dbed42ff581ca609c1e386119f68c1d8c5a6555d3417fb10995cee7c8ae1f059d689a14001028201d818569f9f1ab2d05e001b0000001acd5b27a6000000ff11ff82583900df1bcda8b01aeacb1f9b030d71b58999cbee1e1f07201fc44a058a7a81de9a41f922554ceb5f567fdbc4e54305d16760213512290cd49287821a001495a6a2581c186cd98a29585651c89f05807a876cf26cdf47a7f86f70be3b9e4cc0a1401b0000001acd5b27a6581c919d4c2c9455016289341b1a14dedf697687af31751170d56a31466ea144744d494e1b00000001dcd6500082583900df1bcda8b01aeacb1f9b030d71b58999cbee1e1f07201fc44a058a7a81de9a41f922554ceb5f567fdbc4e54305d16760213512290cd492871b0000000ae0a24849021a0008b76d031a05b3de6809a1581c186cd98a29585651c89f05807a876cf26cdf47a7f86f70be3b9e4cc0a1401b0000001acd5b27a60b582019b1c279860f8511f0700a498d8ae2d4e212cdddd10414f10d9d290ad9664cd00d8182582005a5fe099267da09aaacfc113f241b60ddbe7e5d27909567e9a4924a565fc36d020e81581cdf1bcda8b01aeacb1f9b030d71b58999cbee1e1f07201fc44a058a7a1082583900df1bcda8b01aeacb1f9b030d71b58999cbee1e1f07201fc44a058a7a81de9a41f922554ceb5f567fdbc4e54305d16760213512290cd492871b0000000ae0601c78111a000d13241284825820782a280b9f174bdfd72c0892cce8b4b54cb3a4c3f25d4e902f1abf478bd053b300825820f54a29f5470990e6d0aa1677089e89d67710e59a1e6e2bcb5dfb6ff4363132960082582053478bdd28ed27bd67fe6afba23f1f937d8e78f551f2de478fe72885bf2439f8018258208d511982a6e60cf39511555c525a4705374dfdce0093b0bb948f2017e8e8a79602a300d90102818258203bee417427b992b5b3327dd8d2a5afa2391c4b9e4832a7d012664eb892c630c85840fd7456778164c9d6fe8a6582a53e15ffebbbed5c2303b3a047da32d039e6cb05f0f7e48af01f5d4cb4daaafce60cdeb9851ab968a8d3c48161873fb539ed840b049fd87980ff0582840001d87980821a0005b0081a07ca1456840100d87980821a001f61031a2c708df8f5f6",
    nitroAddress: Address.fromBech32(
      "addr_test1qp2t43hr6aktanylcpqngr98a3l2a8mpwt566r0yxtujj255cyxmu3jfgktsagvgyggy759khn808gxsaacaj0kmszkqw47mas",
    ),
    qMinAsset: Asset.fromString("186cd98a29585651c89f05807a876cf26cdf47a7f86f70be3b9e4cc0"),
  };
});

// not work with Liqwid Tx
const _stimulateSignTx = (tx: string, privateKey: PrivateKey) => {
  const ECSL = RustModule.getE;
  const cTx = ECSL.Transaction.from_hex(tx);
  console.log("debug", cTx.witness_set().to_json());
  const txHash = blake2b256(Buffer.from(cTx.body().to_bytes()));
  console.log("txHash", txHash);
  const txComplete = new TxComplete(cTx);
  const witnessSetRaw = txComplete.partialSignWithPrivateKey(privateKey);
  const debugWitness = ECSL.TransactionWitnessSet.from_hex(witnessSetRaw);
  console.log("debugWitness", debugWitness.to_json());
  return witnessSetRaw;
};

describe("Minswap Lending Market - Nitro Wallet", () => {
  it("test sign liqwid tx", () => {
    const witness = LiqwidProvider.signLiqwidTx(mockData.txHex, mockData.wallet.paymentKey);
    const ECSL = RustModule.getE;
    const cWitness = ECSL.TransactionWitnessSet.from_hex(witness);
    const witnessJs = cWitness.to_js_value();
    invariant(witnessJs.vkeys);
    const vkey = witnessJs.vkeys[0];
    expect(vkey.signature).toEqual(
      "fd7456778164c9d6fe8a6582a53e15ffebbbed5c2303b3a047da32d039e6cb05f0f7e48af01f5d4cb4daaafce60cdeb9851ab968a8d3c48161873fb539ed840b",
    );
    expect(vkey.vkey).toEqual("ed25519_pk180hyzap8hxfttvej0hvd9fd05gu3cju7fqe205qjve8t3ykxxryqvslll2");
  });

  it("check tx hash", async () => {
    const txHash = LiqwidProvider.getLiqwidTxHash(mockData.txHex);
    expect(txHash).toEqual("6a26c650a27d7de706a16e4148b38ed677529a9c521972ec5b08960230f0a243");
  });

  it.skip("get loans position", async () => {
    const paymentKey = mockData.wallet.address.toPubKeyHash()?.keyHash.hex;
    invariant(paymentKey);
    const loans = await LiqwidProvider.getLoansBorrow({
      input: {
        paymentKeys: [paymentKey],
      },
      networkEnv: NetworkEnvironment.TESTNET_PREVIEW,
    });
    console.log("Loans:", XJSON.stringify(loans, 2));
  }, 5000);

  it("build tx repay close loan", async () => {
    const wallet = mockData.wallet;
    const utxos = await NitroWallet.fetchRawUtxos(wallet.address.bech32);
    const paymentKey = mockData.wallet.address.toPubKeyHash()?.keyHash.hex;
    invariant(paymentKey);
    const loans = await LiqwidProvider.getLoansBorrow({
      input: {
        paymentKeys: [paymentKey],
      },
      networkEnv: NetworkEnvironment.TESTNET_PREVIEW,
    });
    const loan = Result.unwrap(loans)[0];
    const loanCollateral = loan.collaterals[0];
    const collaterals: LiqwidProvider.RepayCollateral[] = [
      {
        id: "Ada.186cd98a29585651c89f05807a876cf26cdf47a7f86f70be3b9e4cc0",
        amount: Math.floor((loanCollateral.amount * 1e6) / loanCollateral.market.exchangeRate),
      },
    ];
    const input: LiqwidProvider.GetRepayTransactionInput = {
      txId: loan.id,
      amount: 0,
      address: wallet.address.bech32,
      utxos,
      collaterals,
      networkEnv: NetworkEnvironment.TESTNET_PREVIEW,
    };
    console.log(XJSON.stringify(input, 2));
    const tx = await LiqwidProvider.getRepayTransaction(input);
    console.log(tx);
  });

  it.skip("supply MIN", async () => {
    const wallet = mockData.wallet;
    const utxos = await NitroWallet.fetchRawUtxos(wallet.address.bech32);
    const supplyTx = await LiqwidProvider.getSupplyTransaction({
      marketId: "MIN",
      amount: 3000000000,
      address: wallet.address.bech32,
      utxos,
      networkEnv: NetworkEnvironment.TESTNET_PREVIEW,
    });
    const txCbor = Result.unwrap(supplyTx);
    console.log("supplyTx:", txCbor);

    const witness = LiqwidProvider.signLiqwidTx(txCbor, wallet.paymentKey);
    console.log("witness:", witness);

    const txHash = await LiqwidProvider.submitTransaction({
      transaction: txCbor,
      signature: witness,
      networkEnv: NetworkEnvironment.TESTNET_PREVIEW,
    });
    console.log("txHash:", txHash);
  }, 30000);

  it.skip("market balance", async () => {
    const minTokenPrice = await Result.unwrap(
      await LiqwidProvider.getMarketPriceInCurrency({
        networkEnv: NetworkEnvironment.TESTNET_PREVIEW,
        marketId: "MIN",
      }),
    );
    expect(minTokenPrice).toBeGreaterThan(0);
  }, 5000);

  it.skip("withdraw all supply", async () => {
    const utxos = await NitroWallet.fetchUtxos(mockData.nitroAddress.bech32);
    const supplyAmount = Utxo.sumValue(utxos).get(mockData.qMinAsset);
    const withdrawAllAmount = await LendingMarket.OpeningLongPosition.calculateWithdrawAllAmount({
      networkEnv: NetworkEnvironment.TESTNET_PREVIEW,
      address: mockData.nitroAddress,
      marketId: "MIN",
      qTokenAmount: Number(supplyAmount),
    });
    console.log("Calculated withdraw all amount:", withdrawAllAmount);
    const _txHex = await LendingMarket.OpeningLongPosition.withdrawAllSupply({
      nitroWallet: {
        address: mockData.nitroAddress,
        privateKey: "ff",
        utxos: utxos.map(Utxo.toHex),
      },
      marketId: "MIN",
      networkEnv: NetworkEnvironment.TESTNET_PREVIEW,
      supplyQTokenAmount: Number(supplyAmount),
      dry: true,
    });
    const _ECSL = RustModule.getE;
    // const tx = ECSL.Transaction.from_hex(txHex);
    // console.log("withdrawAllSupply tx:", tx.to_json());
  }, 10000);

  it.skip("test loan calculation", async () => {
    const utxos = await NitroWallet.fetchUtxos(mockData.wallet.address.bech32);
    const qMinAmount = Utxo.sumValue(utxos).get(mockData.qMinAsset);
    const collateralAmount = await LendingMarket.OpeningLongPosition.calculateWithdrawAllAmount({
      networkEnv: NetworkEnvironment.TESTNET_PREVIEW,
      address: mockData.nitroAddress,
      marketId: "MIN",
      qTokenAmount: Number(qMinAmount),
    });
    const collaterals: LiqwidProvider.LoanCalculationInput["collaterals"] = [
      {
        id: "Ada.186cd98a29585651c89f05807a876cf26cdf47a7f86f70be3b9e4cc0",
        amount: Number(collateralAmount / 1e6),
      },
    ];
    console.log({ collateralAmount });
    const loanResult = await LiqwidProvider.loanCalculation({
      networkEnv: NetworkEnvironment.TESTNET_PREVIEW,
      input: {
        market: "Ada",
        debt: 0,
        collaterals,
      },
    });
    console.log(loanResult);
  }, 5000);

  it.skip("borrow ADA by MIN", async () => {
    const utxos = await NitroWallet.fetchUtxos(mockData.wallet.address.bech32);
    const qMinAmount = Utxo.sumValue(utxos).get(mockData.qMinAsset);
    const collateralAmount = await LendingMarket.OpeningLongPosition.calculateWithdrawAllAmount({
      networkEnv: NetworkEnvironment.TESTNET_PREVIEW,
      address: mockData.nitroAddress,
      marketId: "MIN",
      qTokenAmount: Number(qMinAmount),
    });
    const collaterals: LiqwidProvider.LoanCalculationInput["collaterals"] = [
      {
        id: "Ada.186cd98a29585651c89f05807a876cf26cdf47a7f86f70be3b9e4cc0",
        amount: Number(collateralAmount / 1e6),
      },
    ];
    console.log({ collateralAmount });
    const buildTxCollaterals: LiqwidProvider.BorrowCollateral[] = [
      {
        id: "qMIN",
        amount: Number(qMinAmount),
      },
    ];
    const borrowResult = await LendingMarket.OpeningLongPosition.borrowAda({
      networkEnv: NetworkEnvironment.TESTNET_PREVIEW,
      nitroWallet: {
        address: mockData.wallet.address,
        privateKey: mockData.wallet.paymentKey.toHex(),
        utxos: utxos.map(Utxo.toHex),
      },
      borrowMarketId: "Ada",
      currentDebt: 0,
      collaterals,
      buildTxCollaterals,
      dry: true,
    });
    console.log(borrowResult);
  }, 10000);

  it.skip("get net apy", async () => {
    const result = await LiqwidProvider.getNetApy({
      input: {
        paymentKeys: ["54bac6e3d76cbecc9fc041340ca7ec7eae9f6172e9ad0de432f9292a"],
        supplies: [
          {
            marketId: "MIN",
            amount: 469104.291145,
          },
        ],
        currency: "USD",
      },
      networkEnv: NetworkEnvironment.TESTNET_PREVIEW,
    });

    expect(result.type).toBe("ok");
    if (result.type === "ok") {
      console.log("Net APY Result:", result.value);
      expect(typeof result.value.netApy).toBe("number");
      expect(typeof result.value.netApyLqRewards).toBe("number");
      expect(typeof result.value.borrowApy).toBe("number");
      expect(typeof result.value.totalBorrow).toBe("number");
      expect(typeof result.value.supplyApy).toBe("number");
      expect(typeof result.value.totalSupply).toBe("number");

      // Verify specific fields exist and are reasonable values
      expect(result.value.netApy).toBeGreaterThanOrEqual(0);
      expect(result.value.supplyApy).toBeGreaterThanOrEqual(0);
      expect(result.value.totalSupply).toBeGreaterThanOrEqual(0);
    }
  }, 5000);

  it.skip("test submitTx", async () => {
    const tx =
      "84ab00838258204ea0f71038e6eaf695169f05dcbc974a22af3b7e3cf7738b86d0e71ae739d73c0282582005a5fe099267da09aaacfc113f241b60ddbe7e5d27909567e9a4924a565fc36d0182582005a5fe099267da09aaacfc113f241b60ddbe7e5d27909567e9a4924a565fc36d020183a300581d703a85e74973d226016bb10f39a0113708856af24408c69ee983f4f73001821a002dc6c0a2581c919d4c2c9455016289341b1a14dedf697687af31751170d56a31466ea144744d494e1b00000036dbed42ff581ca609c1e386119f68c1d8c5a6555d3417fb10995cee7c8ae1f059d689a14001028201d818569f9f1ab2d05e001b0000001acbc7fd8d000000ff11ff82583900df1bcda8b01aeacb1f9b030d71b58999cbee1e1f07201fc44a058a7a81de9a41f922554ceb5f567fdbc4e54305d16760213512290cd49287821a0028e7f4a4581c11105193a41832809cef5a9f8bff12b13347602273bfbd8a6aa60775a158206765bbd069a2b97c65867581fc3fa80ae748b86b806d97c244039efa9c4406071b000000013be794f6581c186cd98a29585651c89f05807a876cf26cdf47a7f86f70be3b9e4cc0a1401b0000010e35b31f5b581c50e015ec8204db83a4f57aa9ee40ce6ea157e3b7335a149fafe3f370a1400a581c919d4c2c9455016289341b1a14dedf697687af31751170d56a31466eaf44744441491b00000002540be40044744552471b000009184e72a00044744941471b00000002540be40044744d494e1b0000090aa71305544474574d541b00000002540be4004574414749581b000000e8d4a510004574434f50491b00000002540be4004574444a45441b00000002540be4004574495553441b00000002540be40045745348454e1b00000002540be4004574534e454b1927104574555344411b00000001dcd650004574555344431b000000e8d4a510004574555344541b000000e8d4a51000477453554e4441451b00000001dcd6500082583900df1bcda8b01aeacb1f9b030d71b58999cbee1e1f07201fc44a058a7a81de9a41f922554ceb5f567fdbc4e54305d16760213512290cd492871b0000000ae06452b5021a0008dce7031a05b42aab09a1581c186cd98a29585651c89f05807a876cf26cdf47a7f86f70be3b9e4cc0a1401b0000001acbc7fd8d0b5820668345c6342b991434d59ec2d97a661c8a97700ff8fe1badebeb81344e5e01f60d8182582005a5fe099267da09aaacfc113f241b60ddbe7e5d27909567e9a4924a565fc36d020e81581cdf1bcda8b01aeacb1f9b030d71b58999cbee1e1f07201fc44a058a7a1082583900df1bcda8b01aeacb1f9b030d71b58999cbee1e1f07201fc44a058a7a81de9a41f922554ceb5f567fdbc4e54305d16760213512290cd492871b0000000ae05fe441111a000d4b5b1284825820782a280b9f174bdfd72c0892cce8b4b54cb3a4c3f25d4e902f1abf478bd053b300825820f54a29f5470990e6d0aa1677089e89d67710e59a1e6e2bcb5dfb6ff436313296008258204ea0f71038e6eaf695169f05dcbc974a22af3b7e3cf7738b86d0e71ae739d73c018258208d511982a6e60cf39511555c525a4705374dfdce0093b0bb948f2017e8e8a79602a2049fd87980ff0582840002d87980821a0005b15e1a07d806df840100d87980821a001ed40b1a2c175e07f5f6";
    const witness =
      "a100818258203bee417427b992b5b3327dd8d2a5afa2391c4b9e4832a7d012664eb892c630c858406f3e6a3ef67c84e6ce4fedf188211ca9720b9eb7f287307005d98fb108d6964012c0aa79f0d155e4e63d0b5a71f4ecae8678361ea3845449e0b8148f83df3202";
    const txHash = await LiqwidProvider.submitTransaction({
      transaction: tx,
      signature: witness,
      networkEnv: NetworkEnvironment.TESTNET_PREVIEW,
    });
    console.log("txHash:", txHash);
  });
});
