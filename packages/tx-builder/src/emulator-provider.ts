import { DEFAULT_PROTOCOL_PARAMS, NetworkEnvironment, UnstableProtocolParams } from "@repo/ledger-core";
import { ITxBuilderProvider } from "./tx-builder";

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
