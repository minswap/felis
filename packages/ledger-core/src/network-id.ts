export enum NetworkID {
  TESTNET = 0,
  MAINNET,
}

export enum NetworkEnvironment {
  MAINNET = 764824073,
  TESTNET_PREVIEW = 2,
  TESTNET_PREPROD = 1,
}
export function networkEnvironmentToNetworkID(env: NetworkEnvironment): NetworkID {
  const cases: Record<NetworkEnvironment, NetworkID> = {
    [NetworkEnvironment.MAINNET]: NetworkID.MAINNET,
    [NetworkEnvironment.TESTNET_PREPROD]: NetworkID.TESTNET,
    [NetworkEnvironment.TESTNET_PREVIEW]: NetworkID.TESTNET,
  };

  return cases[env];
}
