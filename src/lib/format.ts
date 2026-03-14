export function shortenAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function getExplorerUrl(signature: string, network: string): string {
  const base = 'https://solscan.io/tx/';
  return network === 'mainnet-beta'
    ? `${base}${signature}`
    : `${base}${signature}?cluster=devnet`;
}
