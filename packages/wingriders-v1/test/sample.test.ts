import { describe, it, expect } from "vitest";
import * as W1 from "../src";
import { NetworkEnvironment, XJSON } from "@repo/ledger-core";


describe("sample", () => {
  it("order", () => {
    const rawDatum = "d8799fd8799fd8799fd8799f581caef74754b3ab0264181a2de83d9143cb4586d2d66480bb4893621558ffd8799fd8799fd8799f581cdd1af8ce295de7a4e85ace038a058459d2ba8a022cc99b4436307d7effffffff581caef74754b3ab0264181a2de83d9143cb4586d2d66480bb48936215581b000002fb8810feb0d8799fd8799f4040ffd8799f581c279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f44534e454bffffffd8799fd87a801a0da38a2dffff";
    const orderDatum = W1.WingridersV1.OrderDatum.fromDataHex(rawDatum, NetworkEnvironment.MAINNET);
    console.log(XJSON.stringify(orderDatum, 2));
  });
});
