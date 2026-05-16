import type * as Ogmios from "@cardano-ogmios/client";
import type * as OgmiosSchema from "@cardano-ogmios/schema";
import type { RewardAddress, UnstableProtocolParams } from "@minswap/felis-ledger-core";
import {
  type CborHex,
  type CSLTransaction,
  Duration,
  getErrorMessage,
  type Maybe,
  Result,
} from "@minswap/felis-ledger-utils";
import type { ITxBuilderProvider } from "@minswap/felis-tx-builder";
import { ExpiringVariable } from "./expiring-variable";

type OgmiosSubmitTransactionResponse =
  | OgmiosSchema.SubmitTransactionSuccess
  | OgmiosSchema.SubmitTransactionError
  | OgmiosSchema.SubmitTransactionDeserialisationError;

const PROTOCOL_PARAMS_TIMEOUT = Duration.newMinutes(3);

export class OgmiosApi implements ITxBuilderProvider {
  private readonly baseUrl: string;
  private expiringProtocolParameters: ExpiringVariable<OgmiosSchema.ProtocolParameters>;

  constructor(ogmiosConnectionConfig: Ogmios.ConnectionConfig) {
    this.baseUrl = `http://${ogmiosConnectionConfig.host}:${ogmiosConnectionConfig.port}`;
    this.expiringProtocolParameters = new ExpiringVariable<OgmiosSchema.ProtocolParameters>();
  }

  private getRequestInit(body: string): RequestInit {
    return {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    };
  }

  async health(): Promise<Ogmios.ServerHealth> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      if (response.ok) {
        const responseJson = (await response.json()) as Ogmios.ServerHealth;
        return responseJson;
      } else {
        throw new Error(`Ogmios check health failed: ${response.statusText}`);
      }
    } catch (err) {
      console.error(`Ogmios check health failed`);
      throw err;
    }
  }

  static async new(config: Ogmios.ConnectionConfig): Promise<OgmiosApi> {
    const ogmiosApi = new OgmiosApi(config);
    const health = await ogmiosApi.health();
    console.info("Ogmios API health", { networkSynchronization: health.networkSynchronization });
    return ogmiosApi;
  }

  async submitTx(tx: CborHex<CSLTransaction>): Promise<Result<string, Error>> {
    const requestBody: OgmiosSchema.SubmitTransaction = {
      jsonrpc: "2.0",
      method: "submitTransaction",
      params: {
        transaction: {
          cbor: tx,
        },
      },
    };
    let response: Response;
    try {
      response = await fetch(this.baseUrl, this.getRequestInit(JSON.stringify(requestBody)));
    } catch (err) {
      const error = new Error(`fail to send the transaction submission request, msg: ${getErrorMessage(err)}`);
      return Result.err(error);
    }

    const responseStatusMsg = `status: ${response.status} | statusText: ${response.statusText}`;

    let responseJson: unknown;
    try {
      responseJson = await response.json();
    } catch (err) {
      const error = new Error(
        `fail to decode the response. ${responseStatusMsg}, message: ${getErrorMessage(err)}`,
      );
      return Result.err(error);
    }

    const transactionResponse = responseJson as OgmiosSubmitTransactionResponse;
    if ("result" in transactionResponse) {
      return Result.ok(transactionResponse.result.transaction.id);
    } else if ("error" in transactionResponse) {
      const error = new Error(
        `fail to submit transaction, ${responseStatusMsg}, message: ${JSON.stringify(transactionResponse.error)}`,
      );
      return Result.err(error);
    } else {
      const error = new Error(`unknown error, ${responseStatusMsg}, message: ${JSON.stringify(responseJson)}`);
      return Result.err(error);
    }
  }

  async submitTxUnsafe(tx: CborHex<CSLTransaction>): Promise<string> {
    const txSubmissionResult = await this.submitTx(tx);
    return Result.unwrap(txSubmissionResult);
  }

  async getRewardAmount(address: RewardAddress): Promise<Result<Maybe<bigint>, Error>> {
    const params = address.isPubKey() ? { keys: [address.bech32] } : { scripts: [address.bech32] };
    const requestBody: OgmiosSchema.QueryLedgerStateRewardAccountSummaries = {
      jsonrpc: "2.0",
      method: "queryLedgerState/rewardAccountSummaries",
      params,
      id: null,
    };

    let response: Response;
    try {
      response = await fetch(this.baseUrl, this.getRequestInit(JSON.stringify(requestBody)));
    } catch (err) {
      const error = new Error(`getRewardAmount failed, msg: ${getErrorMessage(err)}`);
      return Result.err(error);
    }
    const responseStatusMsg = `status: ${response.status} | statusText: ${response.statusText}`;
    let responseJson: unknown;
    try {
      responseJson = await response.json();
    } catch (err) {
      const error = new Error(
        `fail to decode the response. ${responseStatusMsg}, message: ${getErrorMessage(err)}`,
      );
      return Result.err(error);
    }
    const rewardAccountResponse = responseJson as OgmiosSchema.QueryLedgerStateRewardAccountSummariesResponse;
    const rewardAccounts = rewardAccountResponse.result;
    if (Object.values(rewardAccounts).length > 0) {
      const rewardAmount = Object.values(rewardAccounts)[0].rewards.ada.lovelace;
      return Result.ok(BigInt(rewardAmount.toString()));
    }

    return Result.ok(null);
  }

  async getRewardAmountOr(address: RewardAddress, defaultValue: bigint): Promise<bigint> {
    const result = await this.getRewardAmount(address);
    if (result.type === "err") return defaultValue;
    return result.value ?? defaultValue;
  }

  async getProtocolParameters(): Promise<Result<OgmiosSchema.ProtocolParameters, Error>> {
    const protocolParameters = this.expiringProtocolParameters.value;
    if (protocolParameters) {
      return Result.ok(protocolParameters);
    }
    const requestBody: OgmiosSchema.QueryLedgerStateProtocolParameters = {
      jsonrpc: "2.0",
      method: "queryLedgerState/protocolParameters",
      id: null,
    };

    let response: Response;
    try {
      response = await fetch(this.baseUrl, this.getRequestInit(JSON.stringify(requestBody)));
    } catch (err) {
      const error = new Error(`fail to get protocol parameters, msg: ${getErrorMessage(err)}`);
      return Result.err(error);
    }
    const responseStatusMsg = `status: ${response.status} | statusText: ${response.statusText}`;
    let responseJson: unknown;
    try {
      responseJson = await response.json();
    } catch (err) {
      const error = new Error(
        `fail to decode the response. ${responseStatusMsg}, message: ${getErrorMessage(err)}`,
      );
      return Result.err(error);
    }

    const protocolParamResponse = responseJson as OgmiosSchema.QueryLedgerStateProtocolParametersResponse;
    this.expiringProtocolParameters.set(protocolParamResponse.result, PROTOCOL_PARAMS_TIMEOUT);
    return Result.ok(protocolParamResponse.result);
  }

  async getUnstableProtocolParams(): Promise<UnstableProtocolParams> {
    const protocolParams = Result.unwrap(await this.getProtocolParameters());
    const plutusCostModels = protocolParams.plutusCostModels;
    if (!plutusCostModels) {
      throw new Error("Not found CostModel in Protocol Parameters");
    }
    const plutusV1 = plutusCostModels["plutus:v1"];
    if (!plutusV1) {
      throw new Error("Not found CostModel of PlutusV1 in Protocol Parameters");
    }
    const plutusV2 = plutusCostModels["plutus:v2"];
    if (!plutusV2) {
      throw new Error("Not found CostModel of PlutusV2 in Protocol Parameters");
    }
    const plutusV3 = plutusCostModels["plutus:v3"];
    const minFeeReferenceScripts = protocolParams.minFeeReferenceScripts;
    return {
      costModels: {
        PlutusV1: plutusV1,
        PlutusV2: plutusV2,
        PlutusV3: plutusV3,
      },
      referenceFee: minFeeReferenceScripts
        ? {
            base: minFeeReferenceScripts.base,
            range: minFeeReferenceScripts.range,
            multiplier: minFeeReferenceScripts.multiplier,
          }
        : undefined,
    };
  }

  async getLatestBlock(): Promise<{ blockHeight: number; currentSlot: number }> {
    const healthData = await this.health();
    return {
      blockHeight: healthData.lastKnownTip.height,
      currentSlot: healthData.lastKnownTip.slot,
    };
  }

  static isOverlapSubmissionError(err: Error): boolean {
    /**
     * Example Error:
     * Error: {"code":3117,"message":"The transaction contains unknown UTxO references as inputs.
     * This can happen if the inputs you're trying to spend have already been spent,
     * or if you've simply referred to non-existing UTxO altogether.
     * The field 'data.unknownOutputReferences' indicates all unknown inputs.
     * ","data":{"unknownOutputReferences":[{"transaction":{"id":"6e26ca1d0c837822c134746bc8fc6595cca99611c1965d6373e185286e0e3b36"},"index":1}]}}
     * New: https://github.com/IntersectMBO/cardano-ledger/issues/4849
     * https://linear.app/minswap/issue/MIN-3343/check-pump-ogmios
     * when submit tx to mempool, if all inputs are spent => Transaction has probably already been included
     * {\"code\":3997,\"message\":\"A transaction was rejected due to custom rules that prevented it from entering the mempool. A justification is given as 'data.error'.\",\"data\":{\"error\":\"All inputs are spent. Transaction has probably already been included\"}}
     */
    const errorMsg = JSON.stringify(err.message);
    return (
      errorMsg.includes("have already been spent") ||
      errorMsg.includes("A transaction was rejected due to custom rules that prevented it from entering the mempool")
    );
  }
}
