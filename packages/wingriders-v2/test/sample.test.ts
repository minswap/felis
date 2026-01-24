import { describe, it, expect } from "vitest";
import * as W2 from "../src";
import { NetworkEnvironment, XJSON } from "@repo/ledger-core";


describe("sample", () => {
  it("order", () => {
    const rawDatum = "d8799f1a001e8480d8799fd8799f581c636d0d0118a8933ac167d4c448150bb325deaf7a4fdfb44adc7f2f5affd8799fd8799fd8799f581ce39b5f40aa85fbc121a625d777a776eca1cb4c923426949c997d8828ffffffffd8799fd8799f581c636d0d0118a8933ac167d4c448150bb325deaf7a4fdfb44adc7f2f5affd8799fd8799fd8799f581ce39b5f40aa85fbc121a625d777a776eca1cb4c923426949c997d8828ffffffff80d879801b0000019cc709c8224040581c5d16cc1a177b5d9ba9cfa9793b07e60f1fb70fea1f8aef064415d11443494147d8799fd87a801a5effe01eff0101ff";
    const orderDatum = W2.WingridersV2.OrderDatum.fromDataHex(rawDatum, NetworkEnvironment.MAINNET);
    console.log(XJSON.stringify(orderDatum, 2));
  });
});
