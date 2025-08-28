export type Ok<T> = { type: "ok"; value: T };
export type Err<E> = { type: "err"; error: E };

export type Result<T, E> = Ok<T> | Err<E>;

export namespace Result {
  export const ok = <T>(value: T): Ok<T> => ({ type: "ok", value });

  export const err = <E>(error: E): Err<E> => ({ type: "err", error });

  export const unwrap = <T, E>(result: Result<T, E>): T => {
    if (result.type === "ok") {
      return result.value;
    }
    throw result.error;
  };

  export const flatten = <T, E>(result: Result<T, E>): [T, null] | [null, E] => {
    if (result.type === "ok") {
      return [result.value, null];
    } else {
      return [null, result.error];
    }
  };

  export function isError<T, E>(result: Result<T, E>): result is Err<E> {
    return result.type === "err";
  }

  export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
    return result.type === "ok";
  }
}
