import { DEFAULT_PROTOCOL_PARAMS, type NetworkEnvironment, type UnstableProtocolParams } from "@repo/ledger-core";
import type { ITxBuilderProvider } from "./tx-builder";

export class EmulatorProvider implements ITxBuilderProvider {
  private readonly networkEnv: NetworkEnvironment;
  constructor(networkEnv: NetworkEnvironment) {
    this.networkEnv = networkEnv;
  }
  async getUnstableProtocolParams(): Promise<UnstableProtocolParams> {
    const pp = DEFAULT_PROTOCOL_PARAMS[this.networkEnv];
    return {
      costModels: pp.costModels,
      referenceFee: pp.referenceFee,
    };
  }
}
