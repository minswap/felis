import { ADA, Address, Bytes, NetworkEnvironment, TxOut, Value } from "@repo/ledger-core";
import { RustModule } from "@repo/ledger-utils";
import { OrderV2Direction } from "@repo/minswap-dex-v2";
import { CoinSelectionAlgorithm, EmulatorProvider } from "@repo/tx-builder";
import { beforeAll, describe, expect, it } from "vitest";
import { Asset } from "../../ledger-core/src";
import { DexVersion, OrderV2StepType } from "../../minswap-dex-v2/dist/order-step";
import { DEXOrderTransaction } from "../src";

beforeAll(async () => {
  await RustModule.load();
});

describe("dex-order-transaction", () => {
  const networkEnv = NetworkEnvironment.TESTNET_PREVIEW;
  const sender = Address.fromBech32(
    "addr_test1qp2t43hr6aktanylcpqngr98a3l2a8mpwt566r0yxtujj255cyxmu3jfgktsagvgyggy759khn808gxsaacaj0kmszkqw47mas",
  );
  const lpAsset = Asset.fromString(
    "11105193a41832809cef5a9f8bff12b13347602273bfbd8a6aa60775.6765bbd069a2b97c65867581fc3fa80ae748b86b806d97c244039efa9c440607",
  );
  it("swap exact in", async () => {
    const txb = DEXOrderTransaction.createBulkOrdersTx({
      networkEnv,
      sender,
      orderOptions: [
        {
          lpAsset,
          version: DexVersion.DEX_V2,
          type: OrderV2StepType.SWAP_EXACT_IN,
          assetIn: ADA,
          amountIn: 100_000_000n,
          minimumAmountOut: 1n,
          direction: OrderV2Direction.A_TO_B,
          killOnFailed: false,
          isLimitOrder: false,
        },
      ],
    });
    const result = await txb.canComplete({
      changeAddress: sender,
      provider: new EmulatorProvider(networkEnv),
      coinSelectionAlgorithm: CoinSelectionAlgorithm.MINSWAP,
      walletUtxos: [
        {
          input: {
            txId: Bytes.fromHex("00".repeat(32)),
            index: 0,
          },
          output: new TxOut(sender, new Value().add(ADA, 200_000_000n)),
        },
      ],
    });
    expect(result).toBeTruthy();
  });
});
