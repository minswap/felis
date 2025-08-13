import { RewardAddress, StakePool, VoteDelegation, DRep, Credential } from "@repo/ledger-core";
import { CSLCertificates, RustModule } from "@repo/ledger-utils";
import { uniqueWith } from "remeda";

export type StakeKeyDelegation = {
  stakeAddress: RewardAddress;
  stakePool: StakePool;
};

// build certificates for stake key register, deregister and delegate
export class CertsBuilder {
  public register: RewardAddress[] = [];
  public deregister: RewardAddress[] = [];
  public delegations: StakeKeyDelegation[] = [];
  public voteDelegation: VoteDelegation[] = [];

  registerStakeKey(...stakeKeys: RewardAddress[]): this {
    this.register.push(...stakeKeys);
    return this;
  }

  deregisterStakeKey(...stakeKeys: RewardAddress[]): this {
    this.deregister.push(...stakeKeys);
    return this;
  }

  delegateStakeKey(...delegations: StakeKeyDelegation[]): this {
    this.delegations.push(...delegations);
    return this;
  }

  delegateVote(...voteDelegations: VoteDelegation[]): this {
    this.voteDelegation.push(...voteDelegations);
    return this;
  }

  get length(): number {
    return this.register.length + this.deregister.length + this.delegations.length + this.voteDelegation.length;
  }

  build(): CSLCertificates {
    const CSL = RustModule.get;
    const ret = CSL.Certificates.new();

    // register
    const dedupRegister = uniqueWith(this.register, (a, b) => a.equals(b));
    for (const stakeAddr of dedupRegister) {
      ret.add(
        CSL.Certificate.new_stake_registration(
          CSL.StakeRegistration.new(Credential.toCSL(stakeAddr.cardanoAddress.stake)),
        ),
      );
    }

    // deregister
    const dedupDeregister = uniqueWith(this.deregister, (a, b) => a.equals(b));
    for (const stakeAddr of dedupDeregister) {
      ret.add(
        CSL.Certificate.new_stake_deregistration(
          CSL.StakeDeregistration.new(Credential.toCSL(stakeAddr.cardanoAddress.stake)),
        ),
      );
    }

    // delegate
    for (const { stakeAddress, stakePool } of this.delegations) {
      ret.add(
        CSL.Certificate.new_stake_delegation(
          CSL.StakeDelegation.new(
            Credential.toCSL(stakeAddress.cardanoAddress.stake),
            CSL.Ed25519KeyHash.from_hex(stakePool.hash.hex),
          ),
        ),
      );
    }

    // vote delegation
    for (const vote of this.voteDelegation) {
      const voteDelegation = CSL.VoteDelegation.new(
        Credential.toCSL(vote.rewardAddress.cardanoAddress.stake),
        DRep.toCSL(vote.drep),
      );
      ret.add(CSL.Certificate.new_vote_delegation(voteDelegation));
    }
    return ret;
  }
}
