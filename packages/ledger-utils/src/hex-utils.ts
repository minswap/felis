export const HEX_REGEX = /^[a-f0-9]*$/i;
export const BASE64_REGEX = /^[a-z0-9+/=]*$/i;
export const isValidHex = (s: string): boolean => HEX_REGEX.test(s);
export const isValidBase64 = (s: string): boolean => BASE64_REGEX.test(s);
