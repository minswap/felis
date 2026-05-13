import { cardanoAddressToRemoteRecipient, formatFinalDestinationRecipient } from "./address-utils.js";

export namespace XReserveApi {
  export type PrepareWithdrawalOptions = {
    xReserveApiUrl: string;
    cardanoSenderAddress: string;
    ethRecipientAddress: string;
    valueExcludingFees?: string;
    valueIncludingFees?: string;
  };

  export type PrepareWithdrawalResult = {
    burnIntentHex: string;
    messageHashToSign: string;
  };

  export async function prepareWithdrawal(opts: PrepareWithdrawalOptions): Promise<PrepareWithdrawalResult> {
    const { xReserveApiUrl, cardanoSenderAddress, ethRecipientAddress } = opts;

    const remoteDepositor = cardanoAddressToRemoteRecipient(cardanoSenderAddress);
    const finalDestRecipient = formatFinalDestinationRecipient(ethRecipientAddress);

    if (!opts.valueExcludingFees && !opts.valueIncludingFees) {
      throw new Error("Either valueExcludingFees or valueIncludingFees must be provided");
    }

    if (opts.valueExcludingFees && opts.valueIncludingFees) {
      throw new Error("valueExcludingFees and valueIncludingFees are mutually exclusive");
    }

    const requestBatch: Record<string, unknown> = {
      token: "USDC",
      remoteDomain: 10004,
      remoteDepositor,
      finalDestinationDomain: 0,
      finalDestinationRecipient: finalDestRecipient,
      useCircleForwarding: true,
    };

    if (opts.valueExcludingFees) {
      requestBatch.valueExcludingFees = opts.valueExcludingFees;
    } else if (opts.valueIncludingFees) {
      requestBatch.valueIncludingFees = opts.valueIncludingFees;
    }

    const body: Record<string, unknown> = {
      batches: [requestBatch],
    };

    const response = await fetch(`${xReserveApiUrl}/v1/prepare-withdrawal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`xReserve API error: ${response.status} ${error}`);
    }

    const data = (await response.json()) as { batches: Array<{ encoded: string; messageHashToSign: string }> };
    const batch = data.batches[0];
    if (!batch) {
      throw new Error("xReserve API returned empty batches");
    }

    return {
      burnIntentHex: batch.encoded,
      messageHashToSign: batch.messageHashToSign,
    };
  }
}
