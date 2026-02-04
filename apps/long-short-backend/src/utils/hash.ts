import CryptoJS from "crypto-js";

export namespace HashUtils {
  export function sha256(data: string): string {
    return CryptoJS.SHA256(data).toString();
  }
}
