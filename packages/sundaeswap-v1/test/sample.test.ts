import { ADA, Asset, Bytes, NetworkEnvironment, PlutusData, Value } from "@minswap/felis-ledger-core";
import { RustModule } from "@minswap/felis-ledger-utils";
import { beforeAll, describe, expect, it } from "vitest";
import * as S1 from "../src";

beforeAll(async () => {
  await RustModule.load();
});

describe("sample", () => {
  it("order datum", () => {
    const rawDatum =
      "d8799f421f04d8799fd8799fd8799fd8799f581cb019495147164900262ad18cbf97a0e81c6de6214a0dea46e836504effd8799fd8799fd8799f581c37138b4127d05ca91491ab334f326b4a0725ed56d6af1aaedeac2109ffffffffd87a80ffd87a80ff1a002625a0d8799fd879801a0a84a0b4d8799f1a000143caffffff";
    const datum = S1.SundaeSwapV1.OrderDatum.fromDataHex(rawDatum, NetworkEnvironment.MAINNET);
    expect(datum.poolIdent.hex).toEqual("1f04");
  });

  it("order info", () => {
    const assetB = Asset.fromString("533bb94a8850ee3ccbe483106489399112b74c905342cb1792a797a0.494e4459");
    const datum = S1.SundaeSwapV1.OrderDatum.fromDataHex(
      "d8799f42b003d8799fd8799fd8799fd8799f581cf9328b14f7918e07af661c42694ba036d47590787fa8af621cc02b0dffd8799fd8799fd8799f581c283330ea86e785339cc69d67948e1350b9ddfa49a2841f7f3cb5f411ffffffffd87a80ffd87a80ff1a002625a0d8799fd87a801a6638d2c0d8799f1a4441e1acffffff",
      NetworkEnvironment.MAINNET,
    );
    const order = S1.SundaeSwapV1.getOrderInfo({
      value: new Value().add(ADA, 4_500_000n).add(assetB, 1715000000n),
      datum,
      assetA: ADA,
      assetB,
    });
    expect(order.assetIn).toEqual(assetB);
  });

  // ─── CreatePool building blocks (mainnet debug3.json reference tx) ──────

  // Mainnet CreatePool tx witness datums and output datum hashes.
  // src: packages/sundaeswap-v1/src/debug3.json
  const FACTORY_INPUT_DATUM_JSON = {
    constructor: 0,
    fields: [
      { bytes: "00" },
      { constructor: 0, fields: [] },
      { bytes: "00" },
      {
        list: [
          { bytes: "9d1cbb54faf284f5d262f591b1f9201a1858de155157dad49f3881c4" },
          { bytes: "694bc6017f9d74a5d9b3ef377b42b9fe4967a04fb1844959057f35bb" },
        ],
      },
    ],
  } as const;

  const _FACTORY_OUTPUT_DATUM_JSON = {
    constructor: 0,
    fields: [
      { bytes: "01" }, // nextPoolIdent bumped from "00" → "01"
      { constructor: 0, fields: [] },
      { bytes: "00" },
      {
        list: [
          { bytes: "9d1cbb54faf284f5d262f591b1f9201a1858de155157dad49f3881c4" },
          { bytes: "694bc6017f9d74a5d9b3ef377b42b9fe4967a04fb1844959057f35bb" },
        ],
      },
    ],
  } as const;

  const POOL_OUTPUT_DATUM_JSON = {
    constructor: 0,
    fields: [
      {
        constructor: 0,
        fields: [
          {
            constructor: 0,
            fields: [{ bytes: "7de52b397c138e44fb6e61aaaeb26219a8059b1749b7c3bd87bd9488" }, { bytes: "524245525259" }],
          },
          {
            constructor: 0,
            fields: [{ bytes: "7de52b397c138e44fb6e61aaaeb26219a8059b1749b7c3bd87bd9488" }, { bytes: "534245525259" }],
          },
        ],
      },
      { bytes: "00" },
      { int: "12247448713" },
      { constructor: 0, fields: [{ int: "1" }, { int: "100" }] },
    ],
  } as const;

  // Datum hashes from mainnet outputs[0] / outputs[1] in debug3.json.
  const FACTORY_OUTPUT_DATUM_HASH = "7f81ce41100a327c2a4b145553fd79703caca92f34595bc11b2e94a583d3da90";
  const POOL_OUTPUT_DATUM_HASH = "d5f0c9a0bcebc3852fb60864065d13b040a703139ba413e58a47779ca518149e";

  it("FactoryDatum round-trips to mainnet input/output datum hashes", () => {
    // Input side: parse → re-serialize → hash matches debug3.json factory input.
    const inputDatum = S1.SundaeSwapV1.FactoryDatum.fromPlutusJson(FACTORY_INPUT_DATUM_JSON);
    expect(inputDatum.nextPoolIdent.hex).toEqual("00");
    expect(inputDatum.scoopers.length).toEqual(2);
    expect(PlutusData.hashPlutusData(S1.SundaeSwapV1.FactoryDatum.toPlutusJson(inputDatum))).toEqual(
      PlutusData.hashPlutusData(FACTORY_INPUT_DATUM_JSON),
    );

    // Output side: bump ident the way buildCreatePool does and check the
    // produced datum hash matches the actual mainnet output datum hash.
    const nextIdentHex = S1.SundaeSwapV1.incrementIdentLE(inputDatum.nextPoolIdent.hex);
    expect(nextIdentHex).toEqual("01");
    const newDatum = {
      ...inputDatum,
      nextPoolIdent: Bytes.fromHex(nextIdentHex),
    };
    expect(PlutusData.hashPlutusData(S1.SundaeSwapV1.FactoryDatum.toPlutusJson(newDatum))).toEqual(
      FACTORY_OUTPUT_DATUM_HASH,
    );
  });

  it("PoolDatum round-trips to mainnet output datum hash", () => {
    const datum = S1.SundaeSwapV1.PoolDatum.fromPlutusJson(POOL_OUTPUT_DATUM_JSON);
    expect(datum.ident.hex).toEqual("00");
    expect(datum.liquidity).toEqual(12_247_448_713n);
    expect(datum.tradingFee).toEqual([1, 100]);
    const rebuilt = S1.SundaeSwapV1.PoolDatum.toPlutusJson(datum);
    expect(PlutusData.hashPlutusData(rebuilt)).toEqual(POOL_OUTPUT_DATUM_HASH);
  });

  it("incrementIdentLE handles carry across byte boundaries", () => {
    expect(S1.SundaeSwapV1.incrementIdentLE("00")).toEqual("01");
    expect(S1.SundaeSwapV1.incrementIdentLE("ff")).toEqual("0001");
    expect(S1.SundaeSwapV1.incrementIdentLE("01ff")).toEqual("02ff"); // LE: low byte first
    expect(S1.SundaeSwapV1.incrementIdentLE("ffff")).toEqual("000001");
  });

  it("isqrt(reserveA × reserveB) reproduces mainnet initial LP supply", () => {
    // From mainnet debug3.json: 10_000_000_000 RBERRY × 15_000_000_000 SBERRY
    // → isqrt = 12_247_448_713 (matches the liquidity field in the pool datum).
    const supply = S1.SundaeSwapV1.isqrt(10_000_000_000n * 15_000_000_000n);
    expect(supply).toEqual(12_247_448_713n);
  });
});
