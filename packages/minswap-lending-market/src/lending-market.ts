import invariant from "@minswap/tiny-invariant";
import { type Address, Asset, NetworkEnvironment, PrivateKey, Utxo } from "@repo/ledger-core";
import { RustModule } from "@repo/ledger-utils";
import { DEXOrderTransaction } from "@repo/minswap-build-tx";
import { DexVersion, OrderV2Direction, OrderV2StepType } from "@repo/minswap-dex-v2";
import { CoinSelectionAlgorithm, EmulatorProvider, TxComplete } from "@repo/tx-builder";

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
      nitroWallet: NitroWallet;
      minAmount: bigint; // Amount of MIN tokens to supply (in lovelace units)
    };
    export const step2SupplyMIN = async (params: Step2SupplyMINParams): Promise<string> => {
      const { nitroWallet, minAmount } = params;
      const query = `
      query GetSupplyTransaction($input: SupplyTransactionInput!) {
        liqwid {
          transactions {
            supply(input: $input) {
              cbor
              __typename
            }
            __typename
          }
          __typename
        }
      }
    `;
      const variables = {
        input: {
          marketId: "MIN",
          amount: Number(minAmount),
          address: nitroWallet.address.bech32,
          changeAddress: nitroWallet.address.bech32,
          otherAddresses: [nitroWallet.address.bech32],
          utxos: nitroWallet.utxos,
        },
      };

      try {
        // Make GraphQL request to Liqwid API via Next.js proxy/route to avoid CORS
        const isClient = typeof window !== "undefined";
        const apiUrl = isClient ? "/api/liqwid/supply" : "https://v2.api.preview.liqwid.dev/graphql";

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            operationName: "GetSupplyTransaction",
            variables,
            query,
          }),
        });

        if (!response.ok) {
          throw new Error(`Liqwid API request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (data.errors) {
          throw new Error(`Liqwid GraphQL error: ${JSON.stringify(data.errors)}`);
        }

        const txCbor: string | undefined = data.data?.liqwid?.transactions?.supply?.cbor;
        console.warn("txCbor", txCbor);
        invariant(txCbor, "No transaction CBOR returned from Liqwid API");

        const ECSL = RustModule.getE;
        const tx = ECSL.Transaction.from_hex(txCbor);
        const txComplete = new TxComplete(tx);
        const privateKey = PrivateKey.fromHex(nitroWallet.privateKey);
        const witnessSetRaw = txComplete.partialSignWithPrivateKey(privateKey);
        const txHash = await OpeningLongPosition.submitTransaction({
          transaction: txCbor,
          signature: witnessSetRaw,
        });
        return txHash;
      } catch (error) {
        console.error("Step2 Supply MIN failed:", error);
        throw new Error(`Failed to supply MIN tokens: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    export type SubmitTransactionParams = {
      transaction: string; // CBOR hex string
      signature: string; // Signature hex string
    };

    export const submitTransaction = async (params: SubmitTransactionParams): Promise<string> => {
      const { transaction, signature } = params;
      const query = `
        mutation SubmitTransaction($input: SubmitTransactionInput!) {
          submitTransaction(input: $input)
        }
      `;

      const variables = {
        input: {
          transaction,
          signature,
        },
      };

      try {
        // Make GraphQL request to Liqwid API via Next.js proxy/route to avoid CORS
        const isClient = typeof window !== "undefined";
        const apiUrl = isClient ? "/api/liqwid/graphql" : "https://v2.api.preview.liqwid.dev/graphql";

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            accept: "*/*",
            "accept-language": "en-US,en;q=0.9",
            "content-type": "application/json",
            "x-app-source": "liqwid-app",
          },
          body: JSON.stringify({
            operationName: "SubmitTransaction",
            variables,
            query,
          }),
        });

        if (!response.ok) {
          throw new Error(`Liqwid API request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (data.errors) {
          throw new Error(`Liqwid GraphQL error: ${JSON.stringify(data.errors)}`);
        }

        const txHash = data.data?.submitTransaction;
        if (!txHash) {
          throw new Error("No transaction hash returned from Liqwid API");
        }

        return txHash;
      } catch (error) {
        console.error("Submit transaction failed:", error);
        throw new Error(`Failed to submit transaction: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
  }
}
