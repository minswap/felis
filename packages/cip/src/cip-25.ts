import { Asset } from "@repo/ledger-core";

export type CIP25File = {
  name: string;
  mediaType: string;
  src: string;
};

export type CIP25NFT = {
  asset: Asset;
  name: string;
  mediaType?: string;
  image: string;
  files?: CIP25File[];
};

export type CIP25Data = {
  [k: string]: Omit<CIP25NFT, "asset">;
};

/**
 * References: https://github.com/cardano-foundation/CIPs/tree/master/CIP-0025
 */
export type CIP25Metadata = {
  [k: string]: CIP25Data;
};

export type CIP25MetadataWithVersion = CIP25Metadata & {
  version?: string;
};
