export type Maybe<T> = T | null | undefined;

export namespace Maybe {
  export function isNothing<T>(a: Maybe<T>): a is null | undefined {
    return a === null || a === undefined;
  }

  export function isJust<T>(a: Maybe<T>): a is T {
    return a !== null && a !== undefined;
  }

  export function map<A, B>(a: Maybe<A>, f: (x: A) => B): Maybe<B> {
    if (isNothing(a)) {
      return null;
    }
    return f(a);
  }

  // Using 1 for loop, faster than arr.map(f).filter(a => isJust(a))
  export function mapTakeJust<A, B>(arr: Array<A>, f: (x: A) => Maybe<B>): Array<B> {
    const ret: Array<B> = [];
    for (const a of arr) {
      const b = f(a);
      if (isJust(b)) {
        ret.push(b);
      }
    }
    return ret;
  }

  export function unwrap<T>(a: Maybe<T>, errMessage: string): T {
    if (isNothing(a)) {
      throw new Error(errMessage);
    }
    return a;
  }
}
