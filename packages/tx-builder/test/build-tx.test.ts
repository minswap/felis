import { Address, NetworkEnvironment, TxOut, Utxo } from "@minswap/felis-ledger-core";
import { RustModule } from "@minswap/felis-ledger-utils";
import { beforeAll, describe, expect, it } from "vitest";
import * as B from "../src";

beforeAll(async () => {
  await RustModule.load();
});

describe("build-tx", () => {
  it("should return TxBuildingError with Insufficient balance when inputs cannot cover outputs", async () => {
    const inputs = [
      "82825820f0dc5fc80e59e1e41974b1506fd1d08791a1c01ef222ba792706baae47a17aac00825839018a4e7add3085a45b31cf6d99da00e9aedef7475d8941d40172fd733775bbf7e0f234455d81f623d0301e1ae94ff7f9cbd2580543486becbc1a05fae121",
      "82825820e8cc304885b7194025ec67014019ab525ae0d19c8fa93a8c3764caf8fb25600201825839018a4e7add3085a45b31cf6d99da00e9aedef7475d8941d40172fd733775bbf7e0f234455d81f623d0301e1ae94ff7f9cbd2580543486becbc1a0024a6c9",
    ];
    const outputs = [
      "a300583911c3e28c36c3447315ba5a56f33da6a6ddc1770a876a8d9f0cb3a97c4c75bbf7e0f234455d81f623d0301e1ae94ff7f9cbd2580543486becbc011a0637ea21028201d81859012cd8799fd8799f581c8a4e7add3085a45b31cf6d99da00e9aedef7475d8941d40172fd7337ffd8799fd8799f581c8a4e7add3085a45b31cf6d99da00e9aedef7475d8941d40172fd7337ffd8799fd8799fd8799f581c75bbf7e0f234455d81f623d0301e1ae94ff7f9cbd2580543486becbcffffffffd87980d8799fd8799f581c8a4e7add3085a45b31cf6d99da00e9aedef7475d8941d40172fd7337ffd8799fd8799fd8799f581c75bbf7e0f234455d81f623d0301e1ae94ff7f9cbd2580543486becbcffffffffd87980d8799f581cf5808c2c990d86da54bfc97d89cee6efa20cd8461616359478d96b4c5820e74c52975908a612d5ce68327040d449aae99f8b463bb6de046a1b23c5713169ffd8799fd87a80d8799f1a05fae121ff01d87980ff1a001e8480d87a80ff",
    ];
    const networkEnv = NetworkEnvironment.MAINNET;
    const txb = new B.TxBuilder(networkEnv);
    txb.payTo(...outputs.map((o) => TxOut.fromHex(o)));
    const result = await txb.complete({
      coinSelectionAlgorithm: B.CoinSelectionAlgorithm.SPEND_ALL,
      walletUtxos: inputs.map(Utxo.fromHex),
      changeAddress: Address.fromBech32(
        "addr1qx9yu7kaxzz6gke3eakenksqaxhdaa68tky5r4qpwt7hxdm4h0m7pu35g4wcra3r6qcpuxhfflmlnj7jtqz5xjrtaj7ql3nq9n",
      ),
      provider: new B.EmulatorProvider(networkEnv),
    });
    expect(result.type).toBe("err");
    if (result.type === "err") {
      expect(result.error).toBeInstanceOf(B.TxBuildingError);
      expect(result.error.message).toBe(B.INSUFFICIENT_BALANCE_ERROR_MESSAGE);
      expect(result.error.error).toBeInstanceOf(B.InsufficientBalanceError);
    }
  });
});
