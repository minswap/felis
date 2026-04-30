import {
  Address,
  AddressType,
  Asset,
  Bytes,
  CredentialType,
  NetworkEnvironment,
  networkEnvironmentToNetworkID,
} from "@minswap/felis-ledger-core";
import { Maybe } from "@minswap/felis-ledger-utils";
import mainnetScripts from "./scripts/mainnet-scripts.json";
import preprodScripts from "./scripts/preprod-scripts.json";

type SundaeSwapV1Scripts = {
  factoryMintScript: string;
  factoryMintScriptHash: string;
  factoryAuthenToken: string;
  factorySpendScript: string;
  factorySpendScriptHash: string;
  factoryAddress: string;
  poolMintScript: string;
  poolMintScriptHash: string;
  poolSpendScript: string;
  poolSpendScriptHash: string;
  orderSpendScript: string;
  orderSpendScriptHash: string;
  licenseEscrowAddress: string;
};

export class SundaeSwapV1Warehouse {
  private static instance: SundaeSwapV1Warehouse | null = null;

  // ─── Protocol constants (network-independent) ───────────────────────────
  static readonly POOL_NFT_NAME_PREFIX = "7020"; // ascii "p "
  static readonly LP_TOKEN_NAME_PREFIX = "6c7020"; // ascii "lp "
  static readonly FACTORY_TOKEN_NAME_HEX = "666163746f7279"; // ascii "factory"

  // The factory.spend validator restricts each tx's validity range to the
  // current scooper-license week. SundaeSwap V1 uses a 7-day window.
  static readonly WEEK_MS = 604_800_000n;

  // Minimum lovelace held by the pool/factory UTxOs (matches mainnet pattern in debug3.json).
  static readonly MIN_LOVELACE = 2_000_000n;

  static readonly DEFAULT_FEE_NUM = 3n;
  static readonly DEFAULT_FEE_DEN = 1_000n;

  // ─── Per-network config ─────────────────────────────────────────────────
  readonly networkEnv: NetworkEnvironment;

  readonly factoryMintScript: Bytes;
  readonly factoryMintScriptHash: Bytes;
  readonly factoryAuthenAsset: Asset;
  readonly factorySpendScript: Bytes;
  readonly factorySpendScriptHash: Bytes;
  readonly factoryAddress: Address;

  readonly poolMintScript: Bytes;
  readonly poolMintScriptHash: Bytes;
  readonly poolSpendScript: Bytes;
  readonly poolSpendScriptHash: Bytes;
  readonly poolAddress: Address;

  readonly orderSpendScript: Bytes;
  readonly orderSpendScriptHash: Bytes;
  readonly orderAddress: Address;

  readonly licenseEscrowAddress: Address;

  private constructor(networkEnv: NetworkEnvironment) {
    const config = SundaeSwapV1Warehouse.getConfig(networkEnv);
    this.networkEnv = networkEnv;

    this.factoryMintScript = Bytes.fromHex(config.factoryMintScript);
    this.factoryMintScriptHash = Bytes.fromHex(config.factoryMintScriptHash);
    this.factoryAuthenAsset = new Asset(
      this.factoryMintScriptHash,
      Bytes.fromHex(SundaeSwapV1Warehouse.FACTORY_TOKEN_NAME_HEX),
    );
    this.factorySpendScript = Bytes.fromHex(config.factorySpendScript);
    this.factorySpendScriptHash = Bytes.fromHex(config.factorySpendScriptHash);
    this.factoryAddress = Address.fromBech32(config.factoryAddress);

    this.poolMintScript = Bytes.fromHex(config.poolMintScript);
    this.poolMintScriptHash = Bytes.fromHex(config.poolMintScriptHash);
    this.poolSpendScript = Bytes.fromHex(config.poolSpendScript);
    this.poolSpendScriptHash = Bytes.fromHex(config.poolSpendScriptHash);
    this.poolAddress = SundaeSwapV1Warehouse.scriptEnterpriseAddress(networkEnv, this.poolSpendScriptHash);

    this.orderSpendScript = Bytes.fromHex(config.orderSpendScript);
    this.orderSpendScriptHash = Bytes.fromHex(config.orderSpendScriptHash);
    this.orderAddress = SundaeSwapV1Warehouse.scriptEnterpriseAddress(networkEnv, this.orderSpendScriptHash);

    this.licenseEscrowAddress = Address.fromBech32(config.licenseEscrowAddress);
  }

  private static getConfig(networkEnv: NetworkEnvironment): SundaeSwapV1Scripts {
    switch (networkEnv) {
      case NetworkEnvironment.MAINNET:
        return mainnetScripts;
      case NetworkEnvironment.TESTNET_PREPROD:
        return preprodScripts;
      default:
        throw new Error(`SundaeSwapV1Warehouse: unsupported network ${networkEnv}`);
    }
  }

  private static scriptEnterpriseAddress(networkEnv: NetworkEnvironment, scriptHash: Bytes): Address {
    return Address.fromCardanoAddress({
      type: AddressType.ENTERPRISE_ADDRESS,
      network: networkEnvironmentToNetworkID(networkEnv),
      payment: {
        type: CredentialType.SCRIPT_CREDENTIAL,
        payload: scriptHash,
      },
    });
  }

  poolNftAsset(ident: Bytes): Asset {
    return new Asset(this.poolMintScriptHash, Bytes.fromHex(SundaeSwapV1Warehouse.POOL_NFT_NAME_PREFIX + ident.hex));
  }

  lpAsset(ident: Bytes): Asset {
    return new Asset(this.poolMintScriptHash, Bytes.fromHex(SundaeSwapV1Warehouse.LP_TOKEN_NAME_PREFIX + ident.hex));
  }

  public static getInstance(networkEnv: NetworkEnvironment): SundaeSwapV1Warehouse {
    if (Maybe.isNothing(SundaeSwapV1Warehouse.instance) || SundaeSwapV1Warehouse.instance.networkEnv !== networkEnv) {
      SundaeSwapV1Warehouse.instance = new SundaeSwapV1Warehouse(networkEnv);
    }
    return SundaeSwapV1Warehouse.instance;
  }
}
