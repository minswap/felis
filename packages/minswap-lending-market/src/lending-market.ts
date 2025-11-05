import { type Address, Asset, NetworkEnvironment, PrivateKey, Utxo } from "@repo/ledger-core";
import { DEXOrderTransaction } from "@repo/minswap-build-tx";
import { DexVersion, OrderV2Direction, OrderV2StepType } from "@repo/minswap-dex-v2";
import { CoinSelectionAlgorithm, EmulatorProvider } from "@repo/tx-builder";
import { LiqwidProvider } from "./liqwid-provider";

export namespace LendingMarket {
  export const mapMINToken = {
    [NetworkEnvironment.MAINNET]: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6.4d494e",
    [NetworkEnvironment.TESTNET_PREPROD]: "16c2dc8ae937e8d3790c7fd7168d7b994621ba14ca11415f39fed72.4d494e",
    [NetworkEnvironment.TESTNET_PREVIEW]: "919d4c2c9455016289341b1a14dedf697687af31751170d56a31466e.744d494e",
  };
  const apiEndpoint = "https://dev-3.minswap.org";

  export type PriceInAdaResponse = {
    price: string;
    assetA: string;
    assetB: string;
    lpAsset: string;
    datumReserves: [string, string];
    valueReserves: [string, string];
    totalLiquidity: string;
    tradingFee: {
      feeANumerator: string;
      feeBNumerator: string;
    };
    feeSharingNumerator?: string;
  };

  // 1 lovelace = ? MIN
  export const fetchAdaMinPrice = async (networkEnv: NetworkEnvironment): Promise<PriceInAdaResponse> => {
    const path = `${apiEndpoint}/wallet/price-in-ada?asset=${LendingMarket.mapMINToken[networkEnv]}`;
    const response = await fetch(path);
    const data = (await response.json()) as PriceInAdaResponse;
    return data;
  };

  export namespace OpeningLongPosition {
    export const OPERATION_FEE_ADA = 10_000_000n; // 10 ADA
    export type NitroWallet = {
      address: Address;
      privateKey: string;
      utxos: string[];
      submitTx: (txHex: string) => Promise<string>;
    };
    export type Step1CreateOrderParams = {
      nitroWallet: NitroWallet;
      priceInAdaResponse: PriceInAdaResponse;
      networkEnv: NetworkEnvironment;
      amountIn: bigint;
    };

    export const step1CreateOrder = async (params: Step1CreateOrderParams): Promise<string> => {
      const { nitroWallet, priceInAdaResponse, amountIn, networkEnv } = params;
      const txb = DEXOrderTransaction.createBulkOrdersTx({
        networkEnv,
        sender: nitroWallet.address,
        orderOptions: [
          {
            lpAsset: Asset.fromString(priceInAdaResponse.lpAsset),
            version: DexVersion.DEX_V2,
            type: OrderV2StepType.SWAP_EXACT_IN,
            assetIn: Asset.fromString(priceInAdaResponse.assetA),
            amountIn: amountIn - OPERATION_FEE_ADA,
            minimumAmountOut: 1n,
            direction: OrderV2Direction.A_TO_B,
            killOnFailed: false,
            isLimitOrder: false,
          },
        ],
      });
      const txComplete = await txb.completeUnsafe({
        changeAddress: nitroWallet.address,
        walletUtxos: nitroWallet.utxos.map(Utxo.fromHex),
        coinSelectionAlgorithm: CoinSelectionAlgorithm.MINSWAP,
        provider: new EmulatorProvider(networkEnv),
      });
      const signedTx = txComplete.signWithPrivateKey(PrivateKey.fromHex(nitroWallet.privateKey)).complete();

      const txHash = await nitroWallet.submitTx(signedTx);
      return txHash;
    };

    export type Step2SupplyMINParams = {
      nitroWallet: Omit<NitroWallet, "submitTx">;
      minAmount: bigint; // Amount of MIN tokens to supply (in lovelace units)
    };
    export const step2SupplyMIN = async (params: Step2SupplyMINParams): Promise<string> => {
      const { nitroWallet, minAmount } = params;
      const supplyResult = await LiqwidProvider.getSupplyTransaction({
        marketId: "MIN",
        amount: Number(minAmount),
        address: nitroWallet.address.bech32,
        utxos: nitroWallet.utxos,
        networkEnv: NetworkEnvironment.TESTNET_PREVIEW,
      });
      if (supplyResult.type === "err") {
        throw new Error(`Failed to get supply transaction: ${supplyResult.error.message}`);
      }
      const txHex = supplyResult.value;
      const witnessSet = LiqwidProvider.signLiqwidTx(txHex, PrivateKey.fromHex(nitroWallet.privateKey));
      const submitResult = await LiqwidProvider.submitTransaction({
        transaction: txHex,
        signature: witnessSet,
        networkEnv: NetworkEnvironment.TESTNET_PREVIEW,
      });
      if (submitResult.type === "err") {
        throw new Error(`Failed to submit transaction: ${submitResult.error.message}`);
      }
      return submitResult.value;
    };
  }
}
