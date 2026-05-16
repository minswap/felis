/**
 * Build an undici Agent that skips TLS cert verification. Use only as a stopgap
 * when the upstream server has an expired cert and you cannot fix it server-side.
 */
async function insecureDispatcher(): Promise<unknown> {
  const { Agent } = await import("undici");
  return new Agent({ connect: { rejectUnauthorized: false } });
}

export namespace USDCxSdkApi {
  export type StoreDatumResult = {
    datumHash: string;
  };

  export async function storeDatum(opts: {
    sdkApiUrl: string;
    datumCBOR: string;
    targetAda?: number;
    /** Skip TLS cert verification for this call only (e.g. expired SDK API cert). */
    insecure?: boolean;
  }): Promise<StoreDatumResult> {
    const { sdkApiUrl, datumCBOR, targetAda, insecure } = opts;

    const body: Record<string, unknown> = {
      datumCBOR: datumCBOR.startsWith("0x") ? datumCBOR.slice(2) : datumCBOR,
    };

    if (targetAda !== undefined) {
      body.targetAda = targetAda;
    }

    const init: RequestInit & { dispatcher?: unknown } = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };
    if (insecure) init.dispatcher = await insecureDispatcher();
    const response = await fetch(`${sdkApiUrl}/store-datum`, init);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SDK API store-datum error: ${response.status} ${error}`);
    }

    const data = (await response.json()) as { success: boolean; datumHash: string | null; message: string | null };
    if (!data.success || !data.datumHash) {
      throw new Error(`SDK API store-datum failed: ${data.message || "unknown error"}`);
    }

    return { datumHash: data.datumHash };
  }

  export type WithdrawalStatus =
    | "AWAITING_FINALITY"
    | "AWAITING_ASSIGNED_SIGNER"
    | "AWAITING_ADDITIONAL_SIGNER"
    | "READY_FOR_CIRCLE_WITHDRAWAL"
    | "CIRCLE_WITHDRAWAL_SUBMITTED"
    | "CIRCLE_WITHDRAWAL_CONFIRMED"
    | "CIRCLE_WITHDRAWAL_FINALIZED"
    | "TX_REVERTED"
    | "CIRCLE_WITHDRAWAL_EXPIRED"
    | "CIRCLE_WITHDRAWAL_FAILED";

  export type RegisterWithdrawalResult = {
    transactionHash: string;
    status: WithdrawalStatus;
  };

  export async function registerWithdrawal(opts: {
    sdkApiUrl: string;
    transactionHash: string;
    localAddress: string;
    /** Skip TLS cert verification for this call only (e.g. expired SDK API cert). */
    insecure?: boolean;
  }): Promise<RegisterWithdrawalResult> {
    const { sdkApiUrl, transactionHash, localAddress, insecure } = opts;

    const init: RequestInit & { dispatcher?: unknown } = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transactionHash,
        localAddress,
      }),
    };
    if (insecure) init.dispatcher = await insecureDispatcher();
    const response = await fetch(`${sdkApiUrl}/register-withdrawal`, init);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SDK API register-withdrawal error: ${response.status} ${error}`);
    }

    const data = (await response.json()) as { transactionHash: string; status: WithdrawalStatus };
    return data;
  }
}
