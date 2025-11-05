export namespace Utils {
  export const shortenAddress = (address: string): string => {
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  };
  export const formatAmount = (amount: bigint, decimals?: number): string => {
    const _decimals = decimals ?? 6;
    return (Number(amount) / 10 ** _decimals).toFixed(2);
  };
}
