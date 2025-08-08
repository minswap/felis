export class IsomorphicTextEncodeDecode {
  public static initializeTextEncoder(): typeof TextEncoder {
    if (typeof window !== "undefined") {
      return TextEncoder;
    }

    const NodeTextEncoder = require("node:util").TextEncoder;
    return NodeTextEncoder;
  }

  public static initializeTextDecoder(): typeof TextDecoder {
    if (typeof window !== "undefined") {
      return TextDecoder;
    }

    const NodeTextDecoder = require("node:util").TextDecoder;
    return NodeTextDecoder;
  }
}
