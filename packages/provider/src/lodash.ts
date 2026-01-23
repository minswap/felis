export function uniq<T>(arr: T[]): T[] {
  const seen = new Set<T>();
  const result: T[] = [];

  for (const item of arr) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }

  return result;
}

export function uniqBy<T, Key>(arr: T[], keySelector: ((item: T) => Key) | keyof T): T[] {
  const seen = new Set<Key>();
  const result: T[] = [];

  let selector: (item: T) => Key;
  if (typeof keySelector === "function") {
    selector = keySelector;
  } else {
    selector = (v: T): Key => v[keySelector] as Key;
  }

  for (const item of arr) {
    const key = selector(item);

    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }

  return result;
}
