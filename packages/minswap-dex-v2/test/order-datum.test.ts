import { NetworkEnvironment } from "@repo/ledger-core";
import { RustModule } from "@repo/ledger-utils";
import { beforeAll, describe, expect, it } from "vitest";
import { OrderV2Datum, OrderV2StepType } from "../src";

beforeAll(async () => {
  await RustModule.load();
});

describe("dex-order-transaction", () => {
  const networkEnv = NetworkEnvironment.TESTNET_PREVIEW;
  it("parse order datum", () => {
    const rawDatum =
      "d8799fd8799f581c54bac6e3d76cbecc9fc041340ca7ec7eae9f6172e9ad0de432f9292affd8799fd8799f581c54bac6e3d76cbecc9fc041340ca7ec7eae9f6172e9ad0de432f9292affd8799fd8799fd8799f581c94c10dbe464945970ea18822104f50b6bccef3a0d0ef71d93edb80acffffffffd87980d8799fd8799f581c54bac6e3d76cbecc9fc041340ca7ec7eae9f6172e9ad0de432f9292affd8799fd8799fd8799f581c94c10dbe464945970ea18822104f50b6bccef3a0d0ef71d93edb80acffffffffd87980d8799f581c11105193a41832809cef5a9f8bff12b13347602273bfbd8a6aa6077558206765bbd069a2b97c65867581fc3fa80ae748b86b806d97c244039efa9c440607ffd87c9fd87a80d8799f1a2522c8cfff1b00000006a1345daad87980ff1a000aae60d87a80ff";
    const orderDatum = OrderV2Datum.fromDataHex(rawDatum, networkEnv);
    expect(orderDatum.step.type).equal(OrderV2StepType.SWAP_EXACT_OUT);
  });
});
