import * as fc from "fast-check";

import {
  ADA,
  AddressType,
  Asset,
  Bytes,
  type CardanoAddress,
  type CardanoBaseAddress,
  type CardanoEnterpriseAddress,
  type CardanoPointerAddress,
  type CardanoRewardAddress,
  type Credential,
  CredentialType,
  NetworkEnvironment,
  NetworkID,
  type StakePoint,
  Value,
} from "../src";

// an Asset is either ADA or a pair of CurrencySymbol (28 bytes) and TokenName (0-32 bytes)
export const arbAsset: fc.Arbitrary<Asset> = fc.oneof(
  fc.constant(ADA),
  fc
    .tuple(fc.uint8Array({ minLength: 28, maxLength: 28 }), fc.uint8Array({ minLength: 0, maxLength: 32 }))
    .map(([currencySymbol, tokenName]) => new Asset(new Bytes(currencySymbol), new Bytes(tokenName))),
);

// a Value is a list of (asset, amount) pair
// amount must be a positive 64-bit integer since CSL can't parse number above 64 bit
export const arbValue: fc.Arbitrary<Value> = fc
  .uniqueArray(
    fc.tuple(
      arbAsset,
      fc.bigIntN(64).filter((x) => x > 0),
    ),
    {
      comparator: ([asset1], [asset2]) => asset1.equals(asset2),
    },
  )
  .map((arr) => arr.reduce<Value>((val, [asset, amount]) => val.add(asset, amount), new Value()));

export const arbNetworkEnvironment: fc.Arbitrary<NetworkEnvironment> = fc.constantFrom(
  NetworkEnvironment.TESTNET_PREPROD,
  NetworkEnvironment.TESTNET_PREVIEW,
  NetworkEnvironment.MAINNET,
);

export const arbNetworkID: fc.Arbitrary<NetworkID> = fc.constantFrom(NetworkID.TESTNET, NetworkID.MAINNET);

export const arbCredential: fc.Arbitrary<Credential> = fc.record({
  type: fc.constantFrom(CredentialType.PUB_KEY_CREDENTIAL, CredentialType.SCRIPT_CREDENTIAL),
  payload: fc.uint8Array({ minLength: 28, maxLength: 28 }).map((b) => new Bytes(b)),
});

export const arbBaseAddress: fc.Arbitrary<CardanoBaseAddress> = fc.record({
  type: fc.constant(AddressType.BASE_ADDRESS),
  network: arbNetworkID,
  payment: arbCredential,
  stake: arbCredential,
});

export const arbPointerAddress: fc.Arbitrary<CardanoPointerAddress> = fc.record({
  type: fc.constant(AddressType.POINTER_ADDRESS),
  network: arbNetworkID,
  payment: arbCredential,
  stake: fc.tuple(fc.nat(), fc.nat(), fc.nat()).map<StakePoint>(([a, b, c]) => ({
    slot: a,
    txIndex: b,
    certIndex: c,
  })),
});

export const arbEnterpriseAddress: fc.Arbitrary<CardanoEnterpriseAddress> = fc.record({
  type: fc.constant(AddressType.ENTERPRISE_ADDRESS),
  network: arbNetworkID,
  payment: arbCredential,
});

export const arbRewardAddress: fc.Arbitrary<CardanoRewardAddress> = fc.record({
  type: fc.constant(AddressType.REWARD_ADDRESS),
  network: arbNetworkID,
  stake: arbCredential,
});

export const arbAddress: fc.Arbitrary<CardanoAddress> = fc.oneof(
  arbBaseAddress,
  arbPointerAddress,
  arbEnterpriseAddress,
  arbRewardAddress,
);
