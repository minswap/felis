import { baseWalletFromEntropy } from "@repo/cip";
import { ADA, type Address, NetworkEnvironment, TxOut, Utxo, Value } from "@repo/ledger-core";
import { sha3 } from "@repo/ledger-utils";
import { CoinSelectionAlgorithm, EmulatorProvider, TxBuilder } from "@repo/tx-builder";

export namespace NitroWallet {
  export type NitroWallet = {
    address: Address;
    privateKey: string;
    rootAddress: string;
  };
  export const mapApiEndpoint = {
    [NetworkEnvironment.MAINNET]: "todo",
    [NetworkEnvironment.TESTNET_PREPROD]: "todo",
    [NetworkEnvironment.TESTNET_PREVIEW]: "https://api.dev-3.minswap.org",
  };
  export const fetchBalance = async (address: string, networkEnv: NetworkEnvironment): Promise<Value> => {
    const apiEndpoint = NitroWallet.mapApiEndpoint[networkEnv];
    const path = `${apiEndpoint}/wallet/balance/address?address=${address}`;
    const response = await fetch(path);
    const data: string = await response.text();
    return Value.fromHex(data);
  };

  export const fetchUtxos = async (address: string, networkEnv: NetworkEnvironment): Promise<Utxo[]> => {
    const apiEndpoint = NitroWallet.mapApiEndpoint[networkEnv];
    const path = `${apiEndpoint}/wallet/utxo/address?address=${address}`;
    const response = await fetch(path);
    const data: string[] = await response.json();
    return data.map(Utxo.fromHex);
  };

  export const fetchRawUtxos = async (address: string, networkEnv: NetworkEnvironment): Promise<string[]> => {
    const apiEndpoint = NitroWallet.mapApiEndpoint[networkEnv];
    const path = `${apiEndpoint}/wallet/utxo/address?address=${address}`;
    const response = await fetch(path);
    const data: string[] = await response.json();
    return data;
  };

  export const createNitroWallet = async (options: {
    signData(addr: string, payload: string): Promise<{ signature: string; key: string }>;
    rootAddress: string;
    networkId: number;
  }) => {
    const { signData, rootAddress, networkId } = options;
    const message = `Create Nitro Wallet with address ${rootAddress}`;
    const signedData = await signData(rootAddress, Buffer.from(message).toString("hex"));
    const entropy = sha3(signedData.signature);
    const nitroWallet = baseWalletFromEntropy(entropy, networkId);
    const nitroWalletData = {
      walletInfo: {
        address: nitroWallet.address,
        rootAddress: rootAddress,
        networkId: networkId,
      },
      privateKey: nitroWallet.paymentKey.toHex(),
    };
    return nitroWalletData;
  };

  export type DepositOptions = {
    nitroAddress: Address;
    rootAddress: Address;
    amount: bigint;
    networkEnv: NetworkEnvironment;
    rootAddressUtxos: string[];
  };
  export const depositNitroFunds = async (options: DepositOptions): Promise<string> => {
    const { nitroAddress, rootAddress, amount, networkEnv, rootAddressUtxos } = options;
    const txb = new TxBuilder(networkEnv).payTo(new TxOut(nitroAddress, new Value().add(ADA, amount)));
    const txComplete = await txb.completeUnsafe({
      changeAddress: rootAddress,
      walletUtxos: rootAddressUtxos.map((u) => Utxo.fromHex(u)),
      coinSelectionAlgorithm: CoinSelectionAlgorithm.MINSWAP,
      provider: new EmulatorProvider(networkEnv),
    });
    return txComplete.complete();
  };

  export type WithdrawOptions = {
    nitroAddress: Address;
    rootAddress: Address;
    amount: bigint;
    networkEnv: NetworkEnvironment;
    nitroAddressUtxos: string[];
  };
  export const withdrawNitroFunds = async (options: WithdrawOptions): Promise<string> => {
    const { nitroAddress, rootAddress, amount, networkEnv, nitroAddressUtxos } = options;
    const txb = new TxBuilder(networkEnv).payTo(new TxOut(rootAddress, new Value().add(ADA, amount)));
    const txComplete = await txb.completeUnsafe({
      changeAddress: nitroAddress,
      walletUtxos: nitroAddressUtxos.map((u) => Utxo.fromHex(u)),
      coinSelectionAlgorithm: CoinSelectionAlgorithm.MINSWAP,
      provider: new EmulatorProvider(networkEnv),
    });
    return txComplete.complete();
  };
}
