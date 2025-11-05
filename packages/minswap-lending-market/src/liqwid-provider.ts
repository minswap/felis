import { NetworkEnvironment, PrivateKey, XJSON } from "@repo/ledger-core";
import { blake2b256, Result, RustModule } from "@repo/ledger-utils";
import * as cbor from "cbor";

export namespace LiqwidProvider {
  export const getApiUrl = (networkEnv: NetworkEnvironment, clientEndpoint: string) => {
    const mapApiUrl: Record<NetworkEnvironment, string> = {
      [NetworkEnvironment.MAINNET]: "https://v2.api.liqwid.finance/graphql",
      [NetworkEnvironment.TESTNET_PREPROD]: "ff",
      [NetworkEnvironment.TESTNET_PREVIEW]: "https://v2.api.preview.liqwid.dev/graphql",
    };
    const isClient = typeof window !== "undefined";
    const apiUrl = isClient ? clientEndpoint : mapApiUrl[networkEnv];
    return apiUrl;
  };

  export const callApi = async (options: {
    clientEndpoint: string;
    networkEnv: NetworkEnvironment;
    operationName: string;
    // biome-ignore lint/suspicious/noExplicitAny: wide range
    variables: any;
    query: string;
    // biome-ignore lint/suspicious/noExplicitAny: wide range
  }): Promise<Result<any, Error>> => {
    try {
      const response = await fetch(getApiUrl(options.networkEnv, options.clientEndpoint), {
        method: "POST",
        headers: {
          accept: "*/*",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          operationName: options.operationName,
          variables: options.variables,
          query: options.query,
        }),
      });
      if (!response.ok) {
        console.log(response);
        const data = await response.json();
        console.log(data);
        return Result.err(new Error(`Liqwid API request failed: ${response.status} ${response.statusText}`));
      }
      const data = await response.json();
      if (data.errors) {
        return Result.err(new Error(`Liqwid GraphQL error: ${XJSON.stringify(data.errors)}`));
      }
      return Result.ok(data.data);
    } catch (error) {
      return Result.err(
        new Error(`Failed ${options.operationName}: ${error instanceof Error ? error.message : String(error)}`),
      );
    }
  };

  export const getSupplyTransaction = async (options: {
    marketId: "MIN";
    amount: number;
    address: string;
    utxos: string[];
    networkEnv: NetworkEnvironment;
  }): Promise<Result<string, Error>> => {
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
        marketId: options.marketId,
        amount: options.amount,
        address: options.address,
        changeAddress: options.address,
        otherAddresses: [options.address],
        utxos: options.utxos,
      },
    };
    const data = await callApi({
      clientEndpoint: "/api/liqwid/supply",
      networkEnv: options.networkEnv,
      operationName: "GetSupplyTransaction",
      variables,
      query,
    });
    if (data.type === "ok") {
      const txCbor: string | undefined = data.value.liqwid?.transactions?.supply?.cbor;
      if (!txCbor) {
        return Result.err(new Error("No transaction CBOR returned from Liqwid API"));
      }
      return Result.ok(txCbor);
    } else {
      return data;
    }
  };

  export const submitTransaction = async (options: {
    transaction: string;
    signature: string;
    networkEnv: NetworkEnvironment;
  }): Promise<Result<string, Error>> => {
    const query = `
        mutation SubmitTransaction($input: SubmitTransactionInput!) {
          submitTransaction(input: $input)
        }
      `;
    const variables = {
      input: {
        transaction: options.transaction,
        signature: options.signature,
      },
    };
    const data = await callApi({
      clientEndpoint: "/api/liqwid/graphql",
      networkEnv: options.networkEnv,
      operationName: "SubmitTransaction",
      variables,
      query,
    });
    if (data.type === "ok") {
      const txHash: string | undefined = data.value.submitTransaction;
      if (!txHash) {
        return Result.err(new Error("No transaction hash returned from Liqwid API"));
      }
      return Result.ok(txHash);
    } else {
      return data;
    }
  };

  export const getLiqwidTxHash = (txHex: string): string => {
    const decoded = cbor.decode(Buffer.from(txHex, "hex"))
    const body = decoded[0];
    const bodyHex = Buffer.from(cbor.encode(body)).toString("hex")
    const txHash = blake2b256(Buffer.from(bodyHex, "hex"));
    return txHash;
  }

  export const signLiqwidTx = (txHex: string, privateKey: PrivateKey) => {
    const txHash = getLiqwidTxHash(txHex);
    const ECSL = RustModule.getE;
    const witnessSet = ECSL.TransactionWitnessSet.new();
    const vkeyWitnesses = ECSL.Vkeywitnesses.new();
    const pKey = privateKey.toECSL();
    const cslTxHash = ECSL.TransactionHash.from_hex(txHash);
    const vKey = ECSL.make_vkey_witness(cslTxHash, pKey);
    vkeyWitnesses.add(vKey);
    witnessSet.set_vkeys(vkeyWitnesses);
    const witnesses = witnessSet.to_hex();
    return witnesses;
  };
}
