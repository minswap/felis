"use client";

import invariant from "@minswap/tiny-invariant";
import { ADA, Asset, Bytes, Utxo, XJSON } from "@repo/ledger-core";
import { sha3 } from "@repo/ledger-utils";
import { LendingMarket, NitroWallet } from "@repo/minswap-lending-market";
import { Button, Layout } from "antd";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { type LongPositionState, nitroWalletAtom, walletAtom } from "./atoms/walletAtom";
import { DepositWithdraw } from "./components/deposit-withdraw";
import { EternlConnector } from "./components/eternl-connector";
import { MarginTrading } from "./components/margin-trading";
import { NitroWalletConnector } from "./components/nitro-wallet-connector";
import { LongPositionStatus } from "./lib/useLong";

export default function Home() {
  const _wallet = useAtomValue(walletAtom);
  const nitroWallet = useAtomValue(nitroWalletAtom);
  const [loading, setLoading] = useState(false);

  const handleLoadRustModule = async () => {
    setLoading(true);

    try {
      const nitroAddress = nitroWallet?.walletInfo.address.bech32;
      invariant(nitroAddress, "Nitro wallet not connected");
      const u2 = await NitroWallet.fetchUtxos(nitroAddress);
      const sumValue = Utxo.sumValue(u2);
      console.log(XJSON.stringify(sumValue, 2));
      const utxos = await NitroWallet.fetchRawUtxos(nitroAddress);
      const withdrawAmount = 12229866126000;
      console.log("trying to withdraw: ", withdrawAmount);
      const txHash = await LendingMarket.OpeningLongPosition.withdrawSupplyMIN({
        nitroWallet: {
          address: nitroWallet.walletInfo.address,
          privateKey: nitroWallet.privateKey,
          utxos: utxos,
        },
        // withdrawAmount: Number(12_228_142_751n), // 12228.142751
        withdrawAmount,
      });
      console.log("Withdraw tx hash:", txHash);
    } catch (error) {
      console.error("Error during withdrawSupplyMIN:", error);
    } finally {
      setLoading(false);
    }

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
          mBought: 1_102_000_000n, // 12228.142751
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
        <div style={{ marginTop: "24px" }}>
          <Button loading={loading} onClick={handleLoadRustModule} style={{ marginTop: "16px" }}>
            Load RustModule
          </Button>
        </div>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <NitroWalletConnector />
          <DepositWithdraw />
          <MarginTrading />
        </div>
      </Layout.Content>
    </Layout>
  );
}
