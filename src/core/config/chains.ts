import { env } from './env';

export type Chain = 'Polygon' | 'Base';

export interface ChainConfig {
  id: number;
  name: Chain;
  explorerUrl: string;
  symbol: string;
  rpcUrl: string; 
}

export const chains: Record<Chain, ChainConfig> = {
  Polygon: {
    id: 137,
    name: 'Polygon',
    explorerUrl: 'https://polygonscan.com',
    symbol: 'MATIC',
    rpcUrl: env.POLYGON_RPC || ''
  },
  Base: {
    id: 8453,
    name: 'Base',
    explorerUrl: 'https://basescan.org',
    symbol: 'ETH',
    rpcUrl: env.BASE_RPC || ''
  }
};

/**
 * Get chain configuration by chain name
 * @param chain - Chain name ('Polygon' or 'Base')
 * @returns Chain configuration object
 */
export const getChainConfig = (chain: Chain): ChainConfig => {
  return chains[chain];
};

/**
 * Get explorer URL for an address on a specific chain
 * @param chain - Chain name
 * @param address - Contract or wallet address
 * @returns Full explorer URL
 */
export const getExplorerUrl = (chain: Chain, address: string): string => {
  const config = getChainConfig(chain);
  return `${config.explorerUrl}/address/${address}`;
};

