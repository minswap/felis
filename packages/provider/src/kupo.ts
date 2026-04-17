import invariant from "@minswap/tiny-invariant";
import { Address, type Asset, type Bytes, type KupoUtxo, type TxIn, Utxo, Value } from "@minswap/felis-ledger-core";
import { type CborHex, type CSLTransactionUnspentOutput, Maybe } from "@minswap/felis-ledger-utils";
import JSONBig from "json-bigint";
import * as R from "remeda";
import { uniq } from "./lodash";

// Kupo response asset quantities (e.g. LP tokens) can exceed 2^53. Native JSON.parse
// rounds them to JS Number, breaking conservation when we re-serialize the value
// into a tx. Parse responses with json-bigint so quantities arrive as native bigints.
const jsonBig = JSONBig({ useNativeBigInt: true });

async function fetchJsonBig<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    throw new Error(`Kupo request failed: ${res.status} ${res.statusText}`);
  }
  return jsonBig.parse(await res.text()) as T;
}

const KUPO_MAX_REQUEST = 100;

const DATUM_REGEX = /^[0-9a-fA-F]{64}$/;
const SCRIPT_HASH_REGEX = /^[0-9a-fA-F]{56}$/;

export type KupoHealthResponse = {
  connection_status: "connected" | "disconnected";
  most_recent_checkpoint: number | null;
  most_recent_node_tip: number | null;
  version: string;
  network_synchronization?: number; // new from v2.11.0+de9c52
};

export type KupoHealth = {
  connectionStatus: "connected" | "disconnected";
  isHealthy: boolean;
  latestSyncedSlot: number;
  latestNodeSyncedSlot: number;
  syncPercent: number;
  version: string;
};

export type KupoUtxosResponse = {
  transaction_id: string;
  transaction_index: bigint;
  output_index: bigint;
  address: string;
  value: {
    coins: bigint;
    assets?: Record<string, bigint>;
  };
  datum_hash: string | null;
  datum_type?: "inline" | "hash" | null;
  script_hash: string | null;
  created_at: {
    slot_no: bigint;
    header_hash: string;
  };
  spent_at: {
    slot_no: bigint;
    header_hash: string;
  } | null;
};

export class KupoService {
  static readonly MAX_REQUEST_THRESHOLD = 20;
  kupoBaseUrl: string;

  constructor(kupoBaseUrl: string) {
    this.kupoBaseUrl = kupoBaseUrl;
  }

  static async new(kupoBaseUrl: string, healthCheck?: boolean): Promise<KupoService> {
    const kupoService = new KupoService(kupoBaseUrl);
    if (healthCheck) {
      const health = await kupoService.health();
      if (health.connectionStatus === "disconnected") {
        throw new Error("Kupo is not connected");
      } else if (!health.isHealthy) {
        throw new Error("Kupo is not healthy");
      }
    }
    return kupoService;
  }

  async getCurrentSlot(): Promise<number> {
    const health = await this.health();
    return health.latestNodeSyncedSlot;
  }

  async utxosByAddress(addresses: Address[]): Promise<Utxo[]> {
    let utxos: KupoUtxo[] = [];
    for (let i = 0; i < addresses.length; i += KUPO_MAX_REQUEST) {
      const queryAddresses = addresses.slice(i, i + KUPO_MAX_REQUEST);
      const tasks: Promise<KupoUtxo[]>[] = [];
      for (const address of queryAddresses) {
        const matches = `${address.bech32}?unspent`;
        tasks.push(this.getUtxosByMatches(matches));
      }
      const queriedUtxos = await Promise.all(tasks);
      utxos = utxos.concat(queriedUtxos.flat());
    }
    return await this.parseUtxo(utxos);
  }

  async utxosRawByAddress(addresses: Address): Promise<CborHex<CSLTransactionUnspentOutput>[]> {
    const utxos = await this.utxosByAddress([addresses]);
    return utxos.map(Utxo.toHex);
  }

  async utxosByTxIn(...txIns: TxIn[]): Promise<Utxo[]> {
    const utxos = await this.kupoUtxosByTxIns(...txIns);
    const sdkUtxos = await this.parseUtxo(utxos);
    return sdkUtxos;
  }

  async kupoUtxosByTxHash(txHash: string): Promise<KupoUtxo[]> {
    const matches = `*@${txHash}?unspent`;
    return await this.getUtxosByMatches(matches);
  }

  async kupoUtxosByTxIn(txIn: TxIn): Promise<KupoUtxo[]> {
    const matches = `${txIn.index}@${txIn.txId.hex}?unspent`;
    return await this.getUtxosByMatches(matches);
  }

  async kupoUtxosByTxIns(...txIns: TxIn[]): Promise<KupoUtxo[]> {
    const utxos: KupoUtxo[] = [];
    for (let i = 0; i < txIns.length; i += KUPO_MAX_REQUEST) {
      const queryTxIns = txIns.slice(i, i + KUPO_MAX_REQUEST);
      const tasks: Promise<KupoUtxo[]>[] = [];
      for (const txIn of queryTxIns) {
        tasks.push(this.kupoUtxosByTxIn(txIn));
      }
      const queriedUtxos = await Promise.all(tasks);
      utxos.push(...queriedUtxos.flat());
    }
    return utxos;
  }

  async kupoUtxosByAddress(address: Address): Promise<KupoUtxo[]> {
    const matches = `${address.bech32}?unspent`;
    return await this.getUtxosByMatches(matches);
  }

  async kupoUtxosByAddresses(addresses: Address[]): Promise<KupoUtxo[]> {
    if (addresses.length === 0) {
      return [];
    }

    let utxos: KupoUtxo[] = [];
    for (let i = 0; i < addresses.length; i += KUPO_MAX_REQUEST) {
      const queryAddresses = addresses.slice(i, i + KUPO_MAX_REQUEST);
      const tasks: Promise<KupoUtxo[]>[] = [];
      for (const address of queryAddresses) {
        tasks.push(this.kupoUtxosByAddress(address));
      }
      const queriedUtxos = await Promise.all(tasks);
      utxos = utxos.concat(queriedUtxos.flat());
    }

    return utxos;
  }

  async kupoUtxosByAsset(asset: Asset): Promise<KupoUtxo[]> {
    try {
      const matches = `${asset.currencySymbol.hex}.${asset.tokenName.hex}?unspent`;
      return await this.getUtxosByMatches(matches);
    } catch (_) {
      return [];
    }
  }

  async kupoUtxosByAssets(assets: Asset[]): Promise<KupoUtxo[]> {
    if (assets.length === 0) {
      return [];
    }
    const chunks = R.chunk(assets, KupoService.MAX_REQUEST_THRESHOLD);
    let utxos: KupoUtxo[] = [];
    for (const chunk of chunks) {
      const inner = await Promise.all(chunk.map((a) => this.kupoUtxosByAsset(a)));
      utxos = utxos.concat(inner.flat());
    }
    return utxos;
  }

  async kupoUtxosByPolicyID(policyID: Bytes): Promise<KupoUtxo[]> {
    const matches = `${policyID.hex}.*?unspent`;
    return await this.getUtxosByMatches(matches);
  }

  async health(): Promise<KupoHealth> {
    const kupoUrl = `${this.kupoBaseUrl}/health`;
    const response = await fetchJsonBig<KupoHealthResponse>(kupoUrl, {
      headers: { Accept: "application/json;charset=utf-8" },
    });

    // We assume slot won't exceed MAX_SAFE_INTEGER
    const latestSyncedSlot = response.most_recent_checkpoint ?? 0;
    const latestNodeSyncedSlot = response.most_recent_node_tip ?? 0;
    const syncPercent = latestNodeSyncedSlot > 0 ? latestSyncedSlot / latestNodeSyncedSlot : 0;
    const isHealthy = latestSyncedSlot === latestNodeSyncedSlot;
    return {
      connectionStatus: response.connection_status,
      isHealthy: isHealthy,
      latestSyncedSlot: latestSyncedSlot,
      latestNodeSyncedSlot: latestNodeSyncedSlot,
      syncPercent: syncPercent,
      version: response.version,
    };
  }

  async getUtxosByMatches(matches: string): Promise<KupoUtxo[]> {
    const kupoUrl = `${this.kupoBaseUrl}/matches/${matches}`;
    const data = await fetchJsonBig<KupoUtxosResponse[]>(kupoUrl);
    if (!Array.isArray(data)) {
      throw new Error(`Kupo returned unexpected response: ${JSON.stringify(data)}`);
    }
    return data.map((d) => ({
      ...d,
      transaction_index: Number(d.transaction_index.toString()),
      output_index: Number(d.output_index.toString()),
    }));
  }

  async getUtxosByPaymentCredential(paymentCredential: Bytes): Promise<Utxo[]> {
    const matches = `${paymentCredential.hex}/*?unspent`;
    const kupoUtxos = await this.getUtxosByMatches(matches);
    const sdkUtxos = await this.parseUtxo(kupoUtxos.flat());
    return sdkUtxos;
  }

  async getKupoUtxosByPaymentCredential(paymentCredential: Bytes): Promise<KupoUtxo[]> {
    const matches = `${paymentCredential.hex}/*?unspent`;
    return await this.getUtxosByMatches(matches);
  }

  async getKupoUtxosByPaymentCredentials(paymentCredentials: Bytes[]): Promise<KupoUtxo[]> {
    if (paymentCredentials.length === 0) {
      return [];
    }

    let utxos: KupoUtxo[] = [];
    for (let i = 0; i < paymentCredentials.length; i += KUPO_MAX_REQUEST) {
      const queryCredentials = paymentCredentials.slice(i, i + KUPO_MAX_REQUEST);
      const tasks: Promise<KupoUtxo[]>[] = [];
      for (const credential of queryCredentials) {
        tasks.push(this.getKupoUtxosByPaymentCredential(credential));
      }
      const queriedUtxos = await Promise.all(tasks);
      utxos = utxos.concat(queriedUtxos.flat());
    }

    return utxos;
  }

  private isValidDatumHash(hash: string): boolean {
    // Check if the hash is a valid base16 string
    return DATUM_REGEX.test(hash);
  }

  async getDatum(datumHash: string): Promise<string | null> {
    if (!this.isValidDatumHash(datumHash)) {
      return null;
    }
    const kupoUrl = `${this.kupoBaseUrl}/datums/${datumHash}`;
    const data = await fetchJsonBig<{ datum: string } | null>(kupoUrl);
    return data ? data.datum : null;
  }

  async getDatums(datumHashes: string[]): Promise<Record<string, string>> {
    if (datumHashes.length === 0) {
      return {};
    }
    const uniqueDatumHashes = uniq(datumHashes);
    const mapDatum: Record<string, string> = {};
    for (let i = 0; i < uniqueDatumHashes.length; i += KUPO_MAX_REQUEST) {
      const queryDatumHashes = uniqueDatumHashes.slice(i, i + KUPO_MAX_REQUEST);
      const tasks: Promise<string | null>[] = [];
      for (const datumHash of queryDatumHashes) {
        tasks.push(this.getDatum(datumHash));
      }
      const datums: (string | null)[] = await Promise.all(tasks);
      for (let i = 0; i < queryDatumHashes.length; i++) {
        const datum = datums[i];
        if (datum) {
          mapDatum[queryDatumHashes[i]] = datum;
        }
      }
    }
    return mapDatum;
  }

  async getDatumHashByAssets(...assets: Asset[]): Promise<Record<string, string>> {
    if (assets.length === 0) {
      return {};
    }
    const mapDatumHash: Record<string, string> = {};
    for (let i = 0; i < assets.length; i += KUPO_MAX_REQUEST) {
      const queryAssets = assets.slice(i, i + KUPO_MAX_REQUEST);
      const tasks: Promise<KupoUtxo[]>[] = [];
      for (const asset of queryAssets) {
        tasks.push(this.kupoUtxosByAsset(asset));
      }
      const queriedUtxos = await Promise.all(tasks);
      for (let i = 0; i < queryAssets.length; i++) {
        const utxos = queriedUtxos[i];
        if (utxos.length > 0 && utxos[0].datum_hash) {
          mapDatumHash[queryAssets[i].toString()] = utxos[0].datum_hash;
        }
      }
    }
    return mapDatumHash;
  }

  async getScript(scriptHash: string): Promise<{ language: string; script: string } | null> {
    if (!SCRIPT_HASH_REGEX.test(scriptHash)) {
      return null;
    }
    const kupoUrl = `${this.kupoBaseUrl}/scripts/${scriptHash}`;
    return await fetchJsonBig<{ language: string; script: string } | null>(kupoUrl);
  }

  async getScripts(scriptHashes: string[]): Promise<Record<string, { language: string; script: string }>> {
    if (scriptHashes.length === 0) {
      return {};
    }
    const uniqueHashes = uniq(scriptHashes);
    const mapScript: Record<string, { language: string; script: string }> = {};
    for (let i = 0; i < uniqueHashes.length; i += KUPO_MAX_REQUEST) {
      const batch = uniqueHashes.slice(i, i + KUPO_MAX_REQUEST);
      const tasks = batch.map((hash) => this.getScript(hash));
      const results = await Promise.all(tasks);
      for (let j = 0; j < batch.length; j++) {
        const result = results[j];
        if (result) {
          mapScript[batch[j]] = result;
        }
      }
    }
    return mapScript;
  }

  private async parseUtxo(kupoUtxos: KupoUtxo[]): Promise<Utxo[]> {
    const datumHashes = kupoUtxos.filter((u) => u.datum_hash && u.datum_type).map((u) => u.datum_hash) as string[];
    const scriptHashes = kupoUtxos.filter((u) => u.script_hash).map((u) => u.script_hash) as string[];

    const [mapDatum, mapScript] = await Promise.all([this.getDatums(datumHashes), this.getScripts(scriptHashes)]);

    const utxos: Utxo[] = [];
    for (const u of kupoUtxos) {
      let datum: string | undefined;
      /**
       * In Kupo, inline datums are not stored in the UTXO, so we need to fetch them separately.
       */
      if (u.datum_hash && u.datum_type === "inline") {
        datum = mapDatum[u.datum_hash];
        invariant(datum, `InlineDatum requires a valid datum, not found datum for ${u.datum_hash}`);
      } else if (u.datum_hash && u.datum_type === "hash") {
        datum = mapDatum[u.datum_hash];
      }

      const scriptData = u.script_hash ? mapScript[u.script_hash] : undefined;
      utxos.push(Utxo.fromKupo(u, datum, scriptData));
    }
    return utxos;
  }

  async getBalance(...addresses: Address[]): Promise<Value> {
    return Utxo.sumValue(await this.utxosByAddress(addresses));
  }

  async getBalanceOfPubKeyAddress(address: string): Promise<Value> {
    const matches = `${address}?unspent`;
    const kupoUtxos = await this.getUtxosByMatches(matches);
    const balance = new Value();
    for (const utxo of kupoUtxos) {
      const address = Address.fromBech32(utxo.address);
      if (Maybe.isJust(address.toScriptHash())) {
        continue;
      }
      const utxoVal = Value.fromKupo(utxo.value);
      balance.addAll(utxoVal);
    }
    return balance;
  }

  async utxosAtWithAsset(address: Address, asset: Asset): Promise<Utxo[]> {
    const matches = `${address.bech32}?unspent&policy_id=${asset.currencySymbol.hex}${asset.tokenName.hex ? `&asset_name=${asset.tokenName.hex}` : ""}`;
    const utxos: KupoUtxo[] = await this.getUtxosByMatches(matches);
    return await this.parseUtxo(utxos);
  }

  async utxoAtScriptHashWithAsset(scriptHash: Bytes, asset: Asset): Promise<Utxo[]> {
    const matches = `${scriptHash.hex}/*?unspent&policy_id=${asset.currencySymbol.hex}${asset.tokenName.hex ? `&asset_name=${asset.tokenName.hex}` : ""}`;
    const utxos: KupoUtxo[] = await this.getUtxosByMatches(matches);
    return await this.parseUtxo(utxos);
  }

  async utxoAtScriptHashWithPolicyId(scriptHash: Bytes, policyId: Bytes): Promise<Utxo[]> {
    const matches = `${scriptHash.hex}/*?unspent&policy_id=${policyId.hex}`;
    const utxos: KupoUtxo[] = await this.getUtxosByMatches(matches);
    return await this.parseUtxo(utxos);
  }
}
