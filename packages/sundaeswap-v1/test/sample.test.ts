import { describe, it, expect } from "vitest";
import * as S1 from "../src";
import { ADA, Asset, NetworkEnvironment, Value, XJSON } from "@repo/ledger-core";

describe("sample", () => {
  it("order datum", () => {
    const rawDatum = "d8799f421f04d8799fd8799fd8799fd8799f581cb019495147164900262ad18cbf97a0e81c6de6214a0dea46e836504effd8799fd8799fd8799f581c37138b4127d05ca91491ab334f326b4a0725ed56d6af1aaedeac2109ffffffffd87a80ffd87a80ff1a002625a0d8799fd879801a0a84a0b4d8799f1a000143caffffff";
    const datum = S1.SundaeSwapV1.OrderDatum.fromDataHex(rawDatum, NetworkEnvironment.MAINNET);
    expect(datum.poolIdent.hex).toEqual("1f04");
  });

  it("order info", () => {
    const assetB = Asset.fromString("533bb94a8850ee3ccbe483106489399112b74c905342cb1792a797a0.494e4459");
    const datum = S1.SundaeSwapV1.OrderDatum.fromDataHex("d8799f42b003d8799fd8799fd8799fd8799f581cf9328b14f7918e07af661c42694ba036d47590787fa8af621cc02b0dffd8799fd8799fd8799f581c283330ea86e785339cc69d67948e1350b9ddfa49a2841f7f3cb5f411ffffffffd87a80ffd87a80ff1a002625a0d8799fd87a801a6638d2c0d8799f1a4441e1acffffff", NetworkEnvironment.MAINNET);
    const order = S1.SundaeSwapV1.getOrderInfo({
      value: new Value().add(ADA, 4_500_000n).add(assetB, 1715000000n),
      datum,
      assetA: ADA,
      assetB,
    });
    expect(order.assetIn).toEqual(assetB);
  });
});
