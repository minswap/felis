import invariant from "@minswap/tiny-invariant";
import { Asset, Bytes, DatumSourceType, type InlineDatum } from "@repo/ledger-core";
import { type Maybe, RustModule, safeFreeRustObjects } from "@repo/ledger-utils";

export const CIP_LABEL_LENGTH = 8;

// https://developers.cardano.org/docs/governance/cardano-improvement-proposals/CIP-0068#reference-nft-label
export const CIP_68_REF_NFT_LABEL = "000643b0";

/**
 * https://developers.cardano.org/docs/governance/cardano-improvement-proposals/CIP-0068#333-ft-standard
 * https://developers.cardano.org/docs/governance/cardano-improvement-proposals/cip-0068/#222-nft-standard
 *
 * RFT not supported
 */
export enum Cip68UserTokenLabel {
  NFT = "000de140",
  FT = "0014df10",
}

// https://developers.cardano.org/docs/governance/cardano-improvement-proposals/cip-0068/#metadata
export type FileDetails = {
  name?: string;
  mediaType: string;
  src: string;
};

export type Cip68NFTMetadata = {
  name: string;
  image: string;
  description?: string;
  files?: FileDetails[];
};

export type Cip68NFTAsset = {
  label: Cip68UserTokenLabel.NFT;
  metadata: Cip68NFTMetadata;
};

// https://developers.cardano.org/docs/governance/cardano-improvement-proposals/CIP-0068#metadata-1
export type Cip68FTMetadata = {
  name: string;
  description: string;
  ticker?: string;
  url?: string;
  decimals?: number;
  logo?: string;
};

export type Cip68FTAsset = {
  label: Cip68UserTokenLabel.FT;
  metadata: {
    name: string;
    description: string;
    ticker?: string;
    url?: string;
    decimals?: number;
    logo?: string;
  };
};

export type Cip68UserTokenAsset = Cip68NFTAsset | Cip68FTAsset;

export type Cip68MintTokenOptions = {
  mint: {
    asset: Asset;
    amount: bigint;
  };
  userTokenAsset: Cip68UserTokenAsset;
};

export type Cip68MintTokenResult = {
  mintUserToken: {
    asset: Asset;
    amount: bigint;
  };
  mintRefNFT: {
    asset: Asset;
    amount: bigint;
  };
  datum: InlineDatum;
};

/**
 * https://developers.cardano.org/docs/governance/cardano-improvement-proposals/cip-0068/
 * I. The basic idea is to have 2 assets issued:
 * 1. `user_token`:
 *  1.1: Purpose: the actual asset that lives in a user's wallet.
 *  1.2: Labels: 222 (000de140) NFT Standard | 333 (0014df10) FT Standard | 444 (001bc280) RFT Standard
 *
 * 2. `Reference NFT`: locked in the output, providing metadata for the corresponding `user_token`.
 *  2.1: Purpose:
 *  2.2: Label: 100 (000643b0) Reference NFT
 *
 * II. Constraint
 * - `user_token` and `ref_nft` MUST be under the same policy ID.
 * - `user_token` MUST exist exactly 1 `ref_nft`.
 * - `user_token` and `ref_nft` can link to each other by sharing the same `asset_name`.
 * - `user_token` and `ref_nft` MUST follow the standard namming pattern.
 *
 * III. Remarks:
 * - `user_token` and `ref_nft` CAN have different minted transaction.
 * - We care only `user_token`: 222 (000de140) NFT Standard and 333 (0014df10) FT Standard
 */
export namespace CIP68 {
  // https://github.com/cardano-foundation/CIPs/tree/master/CIP-0067
  const TABLE = [
    0x00, 0x07, 0x0e, 0x09, 0x1c, 0x1b, 0x12, 0x15, 0x38, 0x3f, 0x36, 0x31, 0x24, 0x23, 0x2a, 0x2d, 0x70, 0x77, 0x7e,
    0x79, 0x6c, 0x6b, 0x62, 0x65, 0x48, 0x4f, 0x46, 0x41, 0x54, 0x53, 0x5a, 0x5d, 0xe0, 0xe7, 0xee, 0xe9, 0xfc, 0xfb,
    0xf2, 0xf5, 0xd8, 0xdf, 0xd6, 0xd1, 0xc4, 0xc3, 0xca, 0xcd, 0x90, 0x97, 0x9e, 0x99, 0x8c, 0x8b, 0x82, 0x85, 0xa8,
    0xaf, 0xa6, 0xa1, 0xb4, 0xb3, 0xba, 0xbd, 0xc7, 0xc0, 0xc9, 0xce, 0xdb, 0xdc, 0xd5, 0xd2, 0xff, 0xf8, 0xf1, 0xf6,
    0xe3, 0xe4, 0xed, 0xea, 0xb7, 0xb0, 0xb9, 0xbe, 0xab, 0xac, 0xa5, 0xa2, 0x8f, 0x88, 0x81, 0x86, 0x93, 0x94, 0x9d,
    0x9a, 0x27, 0x20, 0x29, 0x2e, 0x3b, 0x3c, 0x35, 0x32, 0x1f, 0x18, 0x11, 0x16, 0x03, 0x04, 0x0d, 0x0a, 0x57, 0x50,
    0x59, 0x5e, 0x4b, 0x4c, 0x45, 0x42, 0x6f, 0x68, 0x61, 0x66, 0x73, 0x74, 0x7d, 0x7a, 0x89, 0x8e, 0x87, 0x80, 0x95,
    0x92, 0x9b, 0x9c, 0xb1, 0xb6, 0xbf, 0xb8, 0xad, 0xaa, 0xa3, 0xa4, 0xf9, 0xfe, 0xf7, 0xf0, 0xe5, 0xe2, 0xeb, 0xec,
    0xc1, 0xc6, 0xcf, 0xc8, 0xdd, 0xda, 0xd3, 0xd4, 0x69, 0x6e, 0x67, 0x60, 0x75, 0x72, 0x7b, 0x7c, 0x51, 0x56, 0x5f,
    0x58, 0x4d, 0x4a, 0x43, 0x44, 0x19, 0x1e, 0x17, 0x10, 0x05, 0x02, 0x0b, 0x0c, 0x21, 0x26, 0x2f, 0x28, 0x3d, 0x3a,
    0x33, 0x34, 0x4e, 0x49, 0x40, 0x47, 0x52, 0x55, 0x5c, 0x5b, 0x76, 0x71, 0x78, 0x7f, 0x6a, 0x6d, 0x64, 0x63, 0x3e,
    0x39, 0x30, 0x37, 0x22, 0x25, 0x2c, 0x2b, 0x06, 0x01, 0x08, 0x0f, 0x1a, 0x1d, 0x14, 0x13, 0xae, 0xa9, 0xa0, 0xa7,
    0xb2, 0xb5, 0xbc, 0xbb, 0x96, 0x91, 0x98, 0x9f, 0x8a, 0x8d, 0x84, 0x83, 0xde, 0xd9, 0xd0, 0xd7, 0xc2, 0xc5, 0xcc,
    0xcb, 0xe6, 0xe1, 0xe8, 0xef, 0xfa, 0xfd, 0xf4, 0xf3,
  ];

  export function checksum(byteArr: Uint8Array): number {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    let c: any;
    for (let i = 0; i < byteArr.length; i++) {
      const byte = byteArr[i];
      invariant(typeof byte === "number", "CHECKSUM");
      c = TABLE[(c ^ byte) % 256];
    }
    return c;
  }

  export function isRefNFT(asset: Asset): boolean {
    return asset.tokenName.hex.startsWith(CIP_68_REF_NFT_LABEL);
  }

  export function isNFT(asset: Asset): boolean {
    return asset.tokenName.hex.startsWith(Cip68UserTokenLabel.NFT);
  }

  export function isFT(asset: Asset): boolean {
    return asset.tokenName.hex.startsWith(Cip68UserTokenLabel.FT);
  }

  export function isCip68(assetNameHex: string): boolean {
    if (assetNameHex.length < 8) {
      return false;
    }
    if (!(assetNameHex[0] === "0" && assetNameHex[7] === "0")) {
      return false;
    }
    const checksum = CIP68.checksum(Bytes.fromHex(assetNameHex.substring(1, 5)).bytes).toString(16);
    const targetChecksum = assetNameHex.substring(5, 7);
    return checksum === targetChecksum;
  }

  export function fromDataHex(datum: string, parseAsLabel: Cip68UserTokenLabel): Cip68UserTokenAsset {
    const CSL = RustModule.get;
    const plutusData = CSL.PlutusData.from_hex(datum);
    const rawData = plutusData.to_json(CSL.PlutusDatumSchema.BasicConversions);
    const data = JSON.parse(rawData);
    invariant("fields" in data && Array.isArray(data.fields) && data.fields.length > 0, "invalid cip-68 data hex");
    const metadataJson = data.fields[0];
    safeFreeRustObjects(plutusData);

    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    const unwrapString = (key: string, json: any): string | undefined => {
      if (!(key in json)) {
        return undefined;
      }
      const d = json[key];
      if (typeof d === "string") {
        return d;
      } else if (Array.isArray(d) && d.every((s: unknown) => typeof s === "string")) {
        return d.join("");
      } else {
        return undefined;
      }
    };
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    const unwrapNumber = (key: string, json: any): number | undefined => {
      if (!(key in json)) {
        return undefined;
      }
      const d = Number(json[key]);
      if (!Number.isNaN(d)) {
        return d;
      } else {
        return undefined;
      }
    };

    switch (parseAsLabel) {
      case Cip68UserTokenLabel.FT: {
        return {
          label: parseAsLabel,
          metadata: {
            name: unwrapString("name", metadataJson) ?? "",
            description: unwrapString("description", metadataJson) ?? "",
            ticker: unwrapString("ticker", metadataJson),
            url: unwrapString("url", metadataJson),
            decimals: unwrapNumber("decimals", metadataJson) ?? 0,
            logo: unwrapString("logo", metadataJson),
          },
        };
      }
      case Cip68UserTokenLabel.NFT: {
        const image = unwrapString("image", metadataJson);
        const name = unwrapString("name", metadataJson);
        invariant(image, "NFT CIP-68 metadata image is not found or is not string");
        invariant(name, "NFT CIP-68 metadata name is not found or is not string");
        let files: FileDetails[] | undefined;
        if (metadataJson.files && Array.isArray(metadataJson.files)) {
          files = [];
          for (const fileJson of metadataJson.files) {
            const fileName = unwrapString("name", fileJson);
            const mediaType = unwrapString("mediaType", fileJson);
            const src = unwrapString("src", fileJson);
            invariant(mediaType, "NFT CIP-68 metadata mediaType is not found or is not string");
            invariant(src, "NFT CIP-68 metadata file src is not found or is not string");
            files.push({
              name: fileName,
              mediaType: mediaType,
              src: src,
            });
          }
        }
        return {
          label: parseAsLabel,
          metadata: {
            name: name,
            image: image,
            description: unwrapString("description", metadataJson),
            files: files,
          },
        };
      }
    }
  }

  export function toDataHex(metadata: Cip68FTMetadata | Cip68NFTMetadata): string {
    const CSL = RustModule.get;
    const plutusList = CSL.PlutusList.new();

    const plutusMap = CSL.PlutusData.from_json(JSON.stringify(metadata), CSL.PlutusDatumSchema.BasicConversions);
    plutusList.add(plutusMap);

    const version = CSL.BigInt.from_str("1");
    const plutusVersion = CSL.PlutusData.new_integer(version);
    plutusList.add(plutusVersion);

    const cConstructor = CSL.BigNum.from_str("0");
    const plutusConstr = CSL.ConstrPlutusData.new(cConstructor, plutusList);

    const plutusData = CSL.PlutusData.new_constr_plutus_data(plutusConstr);
    const result = plutusData.to_hex();

    safeFreeRustObjects(plutusList, plutusMap, version, plutusVersion, cConstructor, plutusConstr, plutusData);

    return result;
  }

  export function mintCip68Token(options: Cip68MintTokenOptions): Cip68MintTokenResult {
    const {
      mint: { asset, amount },
      userTokenAsset,
    } = options;
    const userToken = new Asset(asset.currencySymbol, Bytes.fromHex(userTokenAsset.label + asset.tokenName.hex));
    const refNFT = new Asset(asset.currencySymbol, Bytes.fromHex(CIP_68_REF_NFT_LABEL + asset.tokenName.hex));
    const datum: InlineDatum = {
      type: DatumSourceType.INLINE_DATUM,
      data: Bytes.fromHex(CIP68.toDataHex(userTokenAsset.metadata)),
    };
    return {
      mintUserToken: { asset: userToken, amount },
      mintRefNFT: { asset: refNFT, amount: 1n },
      datum,
    };
  }

  export function buildFTFromRefNFT(refNft: Asset): Maybe<Asset> {
    if (!isRefNFT(refNft)) {
      return undefined;
    }

    const refTokenName = refNft.tokenName.hex;
    const tokenName = refTokenName.substring(8);
    const ftTokenName = Cip68UserTokenLabel.FT + tokenName;
    return new Asset(refNft.currencySymbol, Bytes.fromHex(ftTokenName));
  }

  export function buildRefNFTFromRefFT(ft: Asset): Maybe<Asset> {
    if (!isFT(ft)) {
      return undefined;
    }

    const ftTokenName = ft.tokenName.hex;
    const tokenName = ftTokenName.substring(8);
    const refTokenName = CIP_68_REF_NFT_LABEL + tokenName;
    return new Asset(ft.currencySymbol, Bytes.fromHex(refTokenName));
  }
}
