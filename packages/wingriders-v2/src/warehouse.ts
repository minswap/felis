import {
  Address,
  AddressType,
  Asset,
  Bytes,
  CredentialType,
  NetworkEnvironment,
  networkEnvironmentToNetworkID,
  Utxo,
} from "@minswap/felis-ledger-core";
import { Maybe } from "@minswap/felis-ledger-utils";
import invariant from "@minswap/tiny-invariant";
import mainnetReferences from "./scripts/mainnet-references.json";
import mainnetScripts from "./scripts/mainnet-script.json";
import preprodReferences from "./scripts/preprod-references.json";
import preprodScripts from "./scripts/preprod-script.json";

type WingridersV2Scripts = {
  factoryScript: string;
  factoryScriptHash: string;
  dexSymbolScript: string;
  dexSymbolScriptHash: string;
  poolScriptHashCP: string;
  poolScriptHashSS: string;
  requestValidatorHashCP: string;
  requestValidatorHashSS: string;
};

type WingridersV2References = {
  dexSymbolRefInput: string;
  dexSymbolTxId: string;
  factoryRefInput: string;
  factoryTxId: string;
  orderRefInput: string;
  orderTxId: string;
  poolCpRefInput: string;
  poolCpRefTxId: string;
};

type WingridersV2Config = {
  scripts: WingridersV2Scripts;
  references: WingridersV2References;
};

export class WingridersV2Warehouse {
  private static instance: WingridersV2Warehouse | null = null;

  // ─── Protocol constants (network-independent) ───────────────────────────
  static readonly FACTORY_ASSET_NAME = "46"; // "F"
  static readonly VALIDITY_ASSET_NAME = "4c"; // "L"

  static readonly MIN_POOL_ADA = 3_000_000n;
  static readonly MAX_LP_TOKENS = 9_223_372_036_854_775_807n; // 2^63 − 1
  static readonly BURNED_SHARE_TOKENS = 1_000n;

  static readonly DEFAULT_A_SCALE = 1n;
  static readonly DEFAULT_B_SCALE = 1n;
  static readonly DEFAULT_SWAP_FEE_IN_BASIS = 30n;
  static readonly DEFAULT_PROTOCOL_FEE_IN_BASIS = 5n;
  static readonly DEFAULT_FEE_BASIS = 10_000n;
  static readonly DEFAULT_AGENT_FEE_ADA = 2_000_000n;
  static readonly MAX_TX_VALIDITY_RANGE_MS = 86_400_000n;
  static readonly AGENT_TOKEN_NAME = "58"; // "X"
  // PoolConfig.agentSymbol per network (extracted from deployed pool script's applied params).
  private static readonly AGENT_SYMBOL_BY_NETWORK: Partial<Record<NetworkEnvironment, string>> = {
    [NetworkEnvironment.MAINNET]: "1ad3767073087df4fc97fba7ac4a71a0a6cd556f1ad96a7b1c9870c4",
    [NetworkEnvironment.TESTNET_PREPROD]: "d2efbcdf7f346ce85aec08780662d6aa7f638ae8320b58fdbb9e0590",
  };

  // ─── Per-network config ─────────────────────────────────────────────────
  readonly networkEnv: NetworkEnvironment;

  // Factory
  readonly factoryScriptHash: Bytes;
  readonly factoryRefInput: Utxo;
  readonly factoryAddress: Address;

  // Validity minting policy (also used as the LP policy)
  readonly dexSymbolHash: Bytes;
  readonly dexSymbolRefInput: Utxo;

  // Pool validators
  readonly poolScriptHashCP: Bytes;
  readonly poolScriptHashSS: Bytes;
  readonly poolAddressCP: Address;
  readonly poolAddressSS: Address;

  // Request validators
  readonly requestValidatorHashCP: Bytes;
  readonly requestValidatorHashSS: Bytes;
  readonly requestAddressCP: Address;
  readonly orderRefInput: Utxo;
  readonly poolCpRefInput: Utxo;

  // Well-known assets minted under `dexSymbolHash`
  readonly factoryAsset: Asset;
  readonly validityAsset: Asset;

  // Agent authority token (PoolConfig.agentSymbol/agentToken).
  // The pool's `evolve` redeemer requires the agent input to hold exactly 1 of this token.
  readonly agentAsset: Asset;

  private constructor(networkEnv: NetworkEnvironment) {
    const config = WingridersV2Warehouse.getConfig(networkEnv);
    this.networkEnv = networkEnv;

    this.factoryScriptHash = Bytes.fromHex(config.scripts.factoryScriptHash);
    this.factoryRefInput = Utxo.fromHex(config.references.factoryRefInput);

    this.dexSymbolHash = Bytes.fromHex(config.scripts.dexSymbolScriptHash);
    this.dexSymbolRefInput = Utxo.fromHex(config.references.dexSymbolRefInput);

    this.poolScriptHashCP = Bytes.fromHex(config.scripts.poolScriptHashCP);
    this.poolScriptHashSS = Bytes.fromHex(config.scripts.poolScriptHashSS);

    this.requestValidatorHashCP = Bytes.fromHex(config.scripts.requestValidatorHashCP);
    this.requestValidatorHashSS = Bytes.fromHex(config.scripts.requestValidatorHashSS);
    this.orderRefInput = Utxo.fromHex(config.references.orderRefInput);
    this.poolCpRefInput = Utxo.fromHex(config.references.poolCpRefInput);

    this.factoryAddress = WingridersV2Warehouse.scriptAddress(networkEnv, this.factoryScriptHash);
    this.poolAddressCP = WingridersV2Warehouse.scriptAddress(networkEnv, this.poolScriptHashCP);
    this.poolAddressSS = WingridersV2Warehouse.scriptAddress(networkEnv, this.poolScriptHashSS);
    this.requestAddressCP = WingridersV2Warehouse.scriptAddress(networkEnv, this.requestValidatorHashCP);

    this.factoryAsset = new Asset(this.dexSymbolHash, Bytes.fromHex(WingridersV2Warehouse.FACTORY_ASSET_NAME));
    this.validityAsset = new Asset(this.dexSymbolHash, Bytes.fromHex(WingridersV2Warehouse.VALIDITY_ASSET_NAME));

    const agentSymbol: string | undefined = WingridersV2Warehouse.AGENT_SYMBOL_BY_NETWORK[networkEnv];
    invariant(agentSymbol, `WingridersV2Warehouse: no agent symbol configured for network ${networkEnv}`);
    this.agentAsset = new Asset(Bytes.fromHex(agentSymbol), Bytes.fromHex(WingridersV2Warehouse.AGENT_TOKEN_NAME));
  }

  private static getConfig(networkEnv: NetworkEnvironment): WingridersV2Config {
    switch (networkEnv) {
      case NetworkEnvironment.MAINNET:
        return { scripts: mainnetScripts, references: mainnetReferences };
      case NetworkEnvironment.TESTNET_PREPROD:
        return { scripts: preprodScripts, references: preprodReferences };
      default:
        throw new Error(`WingridersV2Warehouse: unsupported network ${networkEnv}`);
    }
  }

  private static scriptAddress(networkEnv: NetworkEnvironment, scriptHash: Bytes): Address {
    return Address.fromCardanoAddress({
      type: AddressType.ENTERPRISE_ADDRESS,
      network: networkEnvironmentToNetworkID(networkEnv),
      payment: {
        type: CredentialType.SCRIPT_CREDENTIAL,
        payload: scriptHash,
      },
    });
  }

  public static getInstance(networkEnv: NetworkEnvironment): WingridersV2Warehouse {
    if (Maybe.isNothing(WingridersV2Warehouse.instance) || WingridersV2Warehouse.instance.networkEnv !== networkEnv) {
      WingridersV2Warehouse.instance = new WingridersV2Warehouse(networkEnv);
    }
    return WingridersV2Warehouse.instance;
  }
}
