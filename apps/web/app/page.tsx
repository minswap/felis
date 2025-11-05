"use client";

import { baseAddressWalletFromSeed } from "@repo/cip";
import { ADA, Asset, Bytes, NetworkEnvironment, XJSON } from "@repo/ledger-core";
import { RustModule, sha3 } from "@repo/ledger-utils";
import { TxComplete } from "@repo/tx-builder";
import { Button, Layout } from "antd";
import { useAtomValue } from "jotai";
import { type LongPositionState, walletAtom } from "./atoms/walletAtom";
import { DepositWithdraw } from "./components/deposit-withdraw";
import { EternlConnector } from "./components/eternl-connector";
import { MarginTrading } from "./components/margin-trading";
import { NitroWalletConnector } from "./components/nitro-wallet-connector";
import { LongPositionStatus } from "./lib/useLong";

export default function Home() {
  const wallet = useAtomValue(walletAtom);
  const handleLoadRustModule = async () => {
    const tx =
      "84ab00838258204ea0f71038e6eaf695169f05dcbc974a22af3b7e3cf7738b86d0e71ae739d73c0282582005a5fe099267da09aaacfc113f241b60ddbe7e5d27909567e9a4924a565fc36d0182582005a5fe099267da09aaacfc113f241b60ddbe7e5d27909567e9a4924a565fc36d020183a300581d703a85e74973d226016bb10f39a0113708856af24408c69ee983f4f73001821a002dc6c0a2581c919d4c2c9455016289341b1a14dedf697687af31751170d56a31466ea144744d494e1b00000036dbed42ff581ca609c1e386119f68c1d8c5a6555d3417fb10995cee7c8ae1f059d689a14001028201d818569f9f1ab2d05e001b0000001acbc7fd8d000000ff11ff82583900df1bcda8b01aeacb1f9b030d71b58999cbee1e1f07201fc44a058a7a81de9a41f922554ceb5f567fdbc4e54305d16760213512290cd49287821a0028e7f4a4581c11105193a41832809cef5a9f8bff12b13347602273bfbd8a6aa60775a158206765bbd069a2b97c65867581fc3fa80ae748b86b806d97c244039efa9c4406071b000000013be794f6581c186cd98a29585651c89f05807a876cf26cdf47a7f86f70be3b9e4cc0a1401b0000010e35b31f5b581c50e015ec8204db83a4f57aa9ee40ce6ea157e3b7335a149fafe3f370a1400a581c919d4c2c9455016289341b1a14dedf697687af31751170d56a31466eaf44744441491b00000002540be40044744552471b000009184e72a00044744941471b00000002540be40044744d494e1b0000090aa71305544474574d541b00000002540be4004574414749581b000000e8d4a510004574434f50491b00000002540be4004574444a45441b00000002540be4004574495553441b00000002540be40045745348454e1b00000002540be4004574534e454b1927104574555344411b00000001dcd650004574555344431b000000e8d4a510004574555344541b000000e8d4a51000477453554e4441451b00000001dcd6500082583900df1bcda8b01aeacb1f9b030d71b58999cbee1e1f07201fc44a058a7a81de9a41f922554ceb5f567fdbc4e54305d16760213512290cd492871b0000000ae06452b5021a0008dce7031a05b42aab09a1581c186cd98a29585651c89f05807a876cf26cdf47a7f86f70be3b9e4cc0a1401b0000001acbc7fd8d0b5820668345c6342b991434d59ec2d97a661c8a97700ff8fe1badebeb81344e5e01f60d8182582005a5fe099267da09aaacfc113f241b60ddbe7e5d27909567e9a4924a565fc36d020e81581cdf1bcda8b01aeacb1f9b030d71b58999cbee1e1f07201fc44a058a7a1082583900df1bcda8b01aeacb1f9b030d71b58999cbee1e1f07201fc44a058a7a81de9a41f922554ceb5f567fdbc4e54305d16760213512290cd492871b0000000ae05fe441111a000d4b5b1284825820782a280b9f174bdfd72c0892cce8b4b54cb3a4c3f25d4e902f1abf478bd053b300825820f54a29f5470990e6d0aa1677089e89d67710e59a1e6e2bcb5dfb6ff436313296008258204ea0f71038e6eaf695169f05dcbc974a22af3b7e3cf7738b86d0e71ae739d73c018258208d511982a6e60cf39511555c525a4705374dfdce0093b0bb948f2017e8e8a79602a2049fd87980ff0582840002d87980821a0005b15e1a07d806df840100d87980821a001ed40b1a2c175e07f5f6";
    const signedResult = await wallet?.api.signTx(tx, true);

    // invariant(wallet.api);
    // invariant(wallet.walletInfo);
    // const data = await wallet.api.signData(wallet.walletInfo.address.bech32, Bytes.fromString("Tony in the air").hex);
    // console.log(data);
    await RustModule.load();
    const ECSL = RustModule.getE;
    const cTx = ECSL.Transaction.from_hex(tx);
    const txComplete = new TxComplete(cTx);
    const walletS = baseAddressWalletFromSeed(
      "muffin spell cement resemble frame pupil grow gloom hawk wild item hungry polar ice maximum sport economy drop sun timber stone circle army jazz",
      NetworkEnvironment.TESTNET_PREVIEW,
    );
    const walletSigned = txComplete.partialSignWithPrivateKey(walletS.paymentKey);
    console.log("signedResult", signedResult);
    console.log("walletSigned:", walletSigned);

    const data: LongPositionState[] = [
      {
        positionId: sha3(Bytes.fromString(`tony_in_the_air`).hex),
        status: LongPositionStatus.STEP_2_SUPPLY_TOKEN,
        nitroWalletAddress:
          "addr_test1qp2t43hr6aktanylcpqngr98a3l2a8mpwt566r0yxtujj255cyxmu3jfgktsagvgyggy759khn808gxsaacaj0kmszkqw47mas",
        leverage: 2,
        longAsset: Asset.fromString("919d4c2c9455016289341b1a14dedf697687af31751170d56a31466e.744d494e"),
        borrowAsset: ADA,
        createdAt: 1762174083434,
        updatedAt: 1762174083434,
        amount: {
          iTotalBuy: 2_200_000_000n,
          iTotalOperationFee: 20_000_000n,
          mTotalPaidFee: 1_000_000n,
          mBought: 1_102_000_000n,
          mTotalLong: 12_228_142_751n,
          mLongBalance: 12_228_142_751n,
          mBorrowed: 0n,
          mSupplied: 0n,
          mRepaid: 0n,
          mWithdrawn: 0n,
        },
        transactions: [
          {
            step: LongPositionStatus.STEP_1_BUY_LONG_ASSET,
            txHash: "73e403c45c336e928a72d21f3f238218447d62a03cf8df8eaf9eb3d6d58e8263",
          },
        ],
      },
    ];
    localStorage.setItem("minswap_long_positions_state", XJSON.stringify(data));
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <EternlConnector />
      <Layout.Content style={{ padding: "24px" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <NitroWalletConnector />
          <DepositWithdraw />
          <MarginTrading />
          <div style={{ marginTop: "24px" }}>
            <Button onClick={handleLoadRustModule} style={{ marginTop: "16px" }}>
              Load RustModule
            </Button>
          </div>
        </div>
      </Layout.Content>
    </Layout>
  );
}
