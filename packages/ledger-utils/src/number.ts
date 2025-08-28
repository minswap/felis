export function parseIntSafe(str: string): number {
  const num = Number(str);
  if (Number.isNaN(num)) {
    throw new Error(`${str} is invalid number`);
  }
  return num;
}
