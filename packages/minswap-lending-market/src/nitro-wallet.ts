import {
  ADA,
  Address,
  NetworkEnvironment,
  TxOut,
  Utxo,
  Value,
} from "@repo/ledger-core";
import { RustModule } from "@repo/ledger-utils";
import {
  CoinSelectionAlgorithm,
  EmulatorProvider,
  TxBuilder,
} from "@repo/tx-builder";

export namespace NitroWallet {
  export type NitroWallet = {
    address: Address;
    privateKey: string;
    rootAddress: string;
  };
  const apiEndpoint = "https://dev-3.minswap.org";
  export const fetchBalance = async (address: string): Promise<Value> => {
    const path = `${apiEndpoint}/wallet/balance/address?address=${address}`;
    const response = await fetch(path);
    const data: string = await response.text();
    return Value.fromHex(data);
  };

  export type DepositOptions = {
    nitroAddress: Address;
    rootAddress: Address;
    amount: bigint;
    networkEnv: NetworkEnvironment;
    rootAddressUtxos: string[];
  };
  export const depositNitroFunds = async (
    options: DepositOptions
  ): Promise<string> => {
    const { nitroAddress, rootAddress, amount, networkEnv, rootAddressUtxos } =
      options;
    const txb = new TxBuilder(networkEnv).payTo(
      new TxOut(nitroAddress, new Value().add(ADA, amount))
    );
    const txComplete = await txb.completeUnsafe({
      changeAddress: rootAddress,
      walletUtxos: rootAddressUtxos.map((u) => Utxo.fromHex(u)),
      coinSelectionAlgorithm: CoinSelectionAlgorithm.MINSWAP,
      provider: new EmulatorProvider(networkEnv),
    });
    return txComplete.complete();
  };
}

// const main = async () => {
//   await RustModule.load();
//   const value = await NitroWallet.fetchBalance("addr_test1qp2t43hr6aktanylcpqngr98a3l2a8mpwt566r0yxtujj255cyxmu3jfgktsagvgyggy759khn808gxsaacaj0kmszkqw47mas");
//   console.log(value.toJSON())
// };

// main();
