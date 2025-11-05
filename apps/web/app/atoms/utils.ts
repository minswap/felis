import { atomWithStorage } from "jotai/utils";

// Utility function to create atoms with localStorage handling
export function createAtomWithStorage<T>(
  key: string,
  initialValue: T,
  parse: (value: string) => T | null,
  serialize: (value: T | null) => string,
) {
  return atomWithStorage<T | null>(key, initialValue, {
    getItem(key, initialValue) {
      if (typeof localStorage === "undefined") {
        return initialValue;
      }
      const storedValue = localStorage.getItem(key);
      if (!storedValue) {
        return initialValue;
      }
      try {
        return parse(storedValue);
      } catch {
        return initialValue;
      }
    },
    setItem(key, newValue) {
      if (typeof localStorage === "undefined") {
        return;
      }
      if (newValue === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, serialize(newValue));
      }
    },
    removeItem(key) {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(key);
      }
    },
  });
}
