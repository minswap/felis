import {
  ADA,
  Address,
  Asset,
  Bytes,
  DatumSourceType,
  NetworkEnvironment,
  TxIn,
  TxOut,
  type Utxo,
  Value,
} from "@minswap/felis-ledger-core";
import { RustModule } from "@minswap/felis-ledger-utils";
import { CoinSelectionAlgorithm, EmulatorProvider } from "@minswap/felis-tx-builder";
import { WingridersV2, WingridersV2Warehouse } from "@minswap/felis-wingriders-v2";
import { beforeAll, describe, expect, it } from "vitest";
import * as B from "../src";

beforeAll(async () => {
  await RustModule.load();
});

describe("wingriders-v2", () => {
  it("buildCreatePool", async () => {
    const owner = Address.fromBech32(
      "addr1qxjy58p6catwuzvprv5jcfgpna9srvty89umn2ykjrjnkn4fhszw0dd6hguypfq49f2yzhf7vjyehknve2s8s3p7u3uqhmh7m6",
    );
    const assetB = Asset.fromString("c0ee29a85b13209423b10447d3c2e6a50641a15c57770e27cb9d5073.57696e67526964657273");

    const options: B.WingridersV2.BuildCreatePoolOptions = {
      networkEnv: NetworkEnvironment.MAINNET,
      owner,
      factoryInput: {
        input: TxIn.fromString("3f04baf552df8bddc402e77ac7cc4d2f63ab3c1a294467288797ab39d32063de#0"),
        output: new TxOut(
          Address.fromBech32("addr1w8zhkkywhknnt4yspr284l0ysxvwcdcx94kwkavgqdg4qycanh6hq"),
          new Value()
            .add(ADA, 5_000_000n)
            .add(WingridersV2Warehouse.getInstance(NetworkEnvironment.MAINNET).factoryAsset, 1n),
          {
            type: DatumSourceType.INLINE_DATUM,
            data: Bytes.fromHex("d8799f41005821ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00ff"),
          },
        ),
      },
      assetA: ADA,
      amountA: 10_000_000n,
      assetB,
      amountB: 194_523_298n,
    };
    const walletUtxos: Utxo[] = [
      {
        input: TxIn.fromString("258c718aace3853ffa273b57546a9fd3d1942105bea1d7904debedf6e1b94e54#1"),
        output: new TxOut(owner, new Value().add(ADA, 554_828_911n)),
      },
      {
        input: TxIn.fromString("9403fc3a6bd1f2b92d14cf61eac76bc64136574f1ac5e2afb9c20b9c1a629316#0"),
        output: new TxOut(owner, new Value().add(ADA, 1_180_940n).add(assetB, 400_000_000n)),
      },
    ];
    // Cross-check share tokenName against the real mainnet create-pool tx
    // 1867a29bf1243f5850ccebdeaf58466325c3c8a13be7a057f3063edc1ff0c144: the
    // pool minted share asset was 6fdc63….e650ce568d…34d2b3eb — confirms
    // computeLpAsset is wired correctly.
    const warehouse = WingridersV2Warehouse.getInstance(NetworkEnvironment.MAINNET);
    const lpAsset = WingridersV2.computeLpAsset(warehouse.dexSymbolHash, ADA, assetB);
    expect(lpAsset.tokenName.hex).equal("e650ce568d1dc1ebfb9bfbd8c06982f3ea95a9959ddaefc783edd95134d2b3eb");

    const txBuilder = B.WingridersV2.buildCreatePool(options);
    const txComplete = await txBuilder.complete({
      walletUtxos,
      coinSelectionAlgorithm: CoinSelectionAlgorithm.SPEND_ALL,
      provider: new EmulatorProvider(NetworkEnvironment.MAINNET),
      changeAddress: options.owner,
    });
    expect(txComplete.type).equal("ok");
  });

  // Fixture from mainnet tx
  // 3c58f27236de3a0cb2de80ca9279671ac2691a5ca0ad3770ce14c8fcfb9bc9b1 — single
  // ADA→NIGHT swap batched through the WR V2 CP NIGHT/ADA pool.
  it("buildBatchTx", async () => {
    const networkEnv = NetworkEnvironment.MAINNET;
    const warehouse = WingridersV2Warehouse.getInstance(networkEnv);

    const NIGHT = Asset.fromString("0691b2fecca1ac4f53cb6dfb00b7013e561d1f34403b957cbb5af1fa.4e49474854");
    const LP_SHARE = Asset.fromString(
      "6fdc63a1d71dc2c65502b79baae7fb543185702b12c3c5fb639ed737.9098d8f2a436c6637776c82b3efa5a1eaa1517bec1077b7d86b4b04a96cec27f",
    );
    const AGENT_TOKEN = Asset.fromString("1ad3767073087df4fc97fba7ac4a71a0a6cd556f1ad96a7b1c9870c4.58");

    const poolAddress = Address.fromBech32(
      "addr1zxhew7fmsup08qvhdnkg8ccra88pw7q5trrncja3dlszhqacq84zk0xfmaxftjjzm9f2q5mauka7jcrdjj89ehx3ex8qa2epvx",
    );
    const agentAddress = Address.fromBech32(
      "addr1qy95vag5yter2lw5anh94p9j3zuc9vsrwks9q0x8anw6t2j8w4y93hwj09d2hztp04ed05jq40xdqdh6fdmplguhs73szf602s",
    );

    // Old pool datum from the batch tx's input UTxO (inline).
    const oldPoolDatumHex =
      "d8799f581cc134d839a64a5dfb9b155869ef3f34280751a622f69958baa8ffd29c4040581c0691b2fecca1ac4f53cb6dfb00b7013e561d1f34403b957cbb5af1fa454e494748540d0200001927101a001e84801b0000019da8215ce01a423e754a1b0000000170c1aa3000000000d87a80d87a80d87980ff";
    const oldPoolDatum = WingridersV2.PoolDatum.fromCborHex(oldPoolDatumHex, networkEnv);

    const poolInput: Utxo = {
      input: TxIn.fromString("340a7735af490a9e2d3a86693de22f7b79c23eaa234efe444287c31dc9ffb116#0"),
      output: new TxOut(
        poolAddress,
        new Value()
          .add(ADA, 160_531_684_429n)
          .add(NIGHT, 1_071_050_470_051n)
          .add(warehouse.validityAsset, 1n)
          .add(LP_SHARE, 9_223_371_661_900_298_006n),
        { type: DatumSourceType.INLINE_DATUM, data: Bytes.fromHex(oldPoolDatumHex) },
      ),
    };

    const agentInput: Utxo = {
      input: TxIn.fromString("b85c474db82c8127e981d7576d3b8e2a626f861064d432c86fc6dd2ec6001512#2"),
      output: new TxOut(agentAddress, new Value().add(ADA, 15_160_770n).add(AGENT_TOKEN, 1n)),
    };

    const orderDatumHex =
      "d8799f1a001e8480d8799fd8799f581c4cd10e5198280feba661a1d63e11f5f482b5d1024a4306155086ecc2ffd8799fd8799fd8799f581c21629cecb2aa94766daf96eaf576d924a4e0cb3116638873ed4ec468ffffffffd8799fd8799f581c4cd10e5198280feba661a1d63e11f5f482b5d1024a4306155086ecc2ffd8799fd8799fd8799f581c21629cecb2aa94766daf96eaf576d924a4e0cb3116638873ed4ec468ffffffff80d879801b0000019da9ea2b5e4040581c0691b2fecca1ac4f53cb6dfb00b7013e561d1f34403b957cbb5af1fa454e49474854d8799fd879801aea18a13cff0101ff";
    const orderInput: Utxo = {
      input: TxIn.fromString("d76ac537e714c0a34fecea1cfe9f0cacb8f72b6e4a4164625a420a4bde92657a#1"),
      output: new TxOut(warehouse.requestAddressCP, new Value().add(ADA, 598_000_000n), {
        type: DatumSourceType.INLINE_DATUM,
        data: Bytes.fromHex(orderDatumHex),
      }),
    };

    // Execution plan — in production the agent computes this from CP math.
    // Here we lift the exact new state out of the mainnet tx's output datum.
    const newPoolDatum: WingridersV2.PoolDatum = {
      ...oldPoolDatum,
      treasuryA: 1_111_508_314n,
      lastInteraction: 1_776_643_394_000n,
    };
    const newPoolValue = new Value()
      .add(ADA, 161_125_684_429n)
      .add(NIGHT, 1_067_103_349_953n)
      .add(warehouse.validityAsset, 1n)
      .add(LP_SHARE, 9_223_371_661_900_298_006n);
    const compensation = new Value().add(ADA, 2_000_000n).add(NIGHT, 3_947_120_098n);

    const txBuilder = B.WingridersV2.buildBatchTx({
      networkEnv,
      agent: agentAddress,
      agentInput,
      pool: { input: poolInput, newValue: newPoolValue, newDatum: newPoolDatum },
      order: { input: orderInput, compensation },
      validFromMs: 1_776_643_394_000n,
      validToMs: 1_776_648_792_000n, // ≈ 1.5h window, same shape as mainnet
    });

    const result = await txBuilder.complete({
      walletUtxos: [agentInput],
      coinSelectionAlgorithm: CoinSelectionAlgorithm.SPEND_ALL,
      provider: new EmulatorProvider(networkEnv),
      changeAddress: agentAddress,
    });
    expect(result.type).equal("ok");
  });
});
