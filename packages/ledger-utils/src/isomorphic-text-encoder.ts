export class IsomorphicTextEncodeDecode {
  public static initializeTextEncoder(): typeof TextEncoder {
    if (typeof window !== "undefined") {
      return TextEncoder;
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const NodeTextEncoder = require("util").TextEncoder;
    return NodeTextEncoder;
  }

  public static initializeTextDecoder(): typeof TextDecoder {
    if (typeof window !== "undefined") {
      return TextDecoder;
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const NodeTextDecoder = require("util").TextDecoder;
    return NodeTextDecoder;
  }
}
