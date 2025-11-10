export namespace Utils {
  export const shortenAddress = (address: string): string => {
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  };
  export const formatAmount = (amount: bigint, decimals?: number): string => {
    const _decimals = decimals ?? 6;
    return (Number(amount) / 10 ** _decimals).toFixed(2);
  };
  export const formatBalance = (balance: bigint | undefined): string => {
    if (!balance) return "0.00";
    return (Number(balance) / 1_000_000).toFixed(2);
  };
}
