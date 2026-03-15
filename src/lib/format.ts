export function shortenAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function getExplorerUrl(signature: string, network: string): string {
  const isMainnet = network === 'mainnet-beta' || network === 'mainnet';
  return isMainnet
    ? `https://solscan.io/tx/${signature}`
    : `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}
