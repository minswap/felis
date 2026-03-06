import type { Duration } from "@minswap/felis-ledger-utils";

type TimeoutType = ReturnType<typeof setTimeout>;

export class ExpiringVariable<T> {
  private _value: T | null = null;
  private expirationTimer?: TimeoutType;

  set(newVal: T, ttl: Duration): void {
    this._value = newVal;
    if (this.expirationTimer) {
      clearTimeout(this.expirationTimer);
    }
    this.expirationTimer = setTimeout(() => {
      this._value = null;
    }, ttl.milliseconds);
  }

  get value(): T | null {
    return this._value;
  }
}
