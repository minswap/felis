import { HashUtils } from "../utils";
import { verifySignData } from "../utils/signature";
import type { SignedDataType } from "./schemas";

export namespace ApiHelper {
  export type AuthenticateResult = { success: true } | { success: false; error: string };

  /**
   * Authenticate a request by verifying the witness signature
   * The witness must be the signed data of JSON.stringify(data)
   *
   * @param data - The data object that was signed
   * @param userAddress - The user's Cardano address (bech32)
   * @param witness - The signed data (COSEKey and COSESign1)
   */
  export function authenticate(data: object, userAddress: string, witness: SignedDataType): AuthenticateResult {
    const message = Buffer.from(JSON.stringify(data)).toString("hex");
    const hashMessage = HashUtils.sha256(message);

    const isValid = verifySignData({
      message: hashMessage,
      address: userAddress,
      key: witness.key,
      signature: witness.signature,
    });

    if (!isValid) {
      return { success: false, error: "Invalid authentication signature" };
    }

    return { success: true };
  }
}
