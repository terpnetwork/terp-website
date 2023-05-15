
import { assets } from 'chain-registry';
import { AssetList, Asset } from '@chain-registry/types';



export const chainName           = process.env.NEXT_PUBLIC_CHAIN ?? 'terpnetwork';;
export const TERPNET_TWITTER_URL = process.env.NEXT_PUBLIC_TERPNET_TWITTER_URL ?? 'https://twitter.com/terpculture';
export const TERPNET_YOUTUBE_URL = process.env.NEXT_PUBLIC_TERPNET_YOUTUBE_URL ?? 'https://youtube.com/terpnetwork';
export const TERPNET_ELEMENT_URL = process.env.NEXT_PUBLIC_TERPNET_ELEMENT_URL ?? 'https://matrix.to/#/!MIEDknobAODITdWMZi:matrix.org?via=matrix.org';
export const TERPNET_DISCORD_URL = process.env.NEXT_PUBLIC_TERPNET_DISCORD_URL ?? 'https://discord.gg/SYEjMwAac7';
export const TERPNET_GITHUB_URL = process.env.NEXT_PUBLIC_TERPNET_GITHUB_URL ?? 'https://github.com/terpnetwork';
export const TERPNET_MEDIUM_URL = process.env.NEXT_PUBLIC_TERPNET_MEDIUM_URL ?? 'https://terpnetwork.medium.com';
export const TERPNET_REDDIT_URL = process.env.NEXT_PUBLIC_TERPNET_REDDIT_URL ?? 'https://www.reddit.com/r/terpnetwork/';



export const defaultChainName = 'terpnetwork';

export const getChainAssets = (chainName: string = defaultChainName) => {
  return assets.find((chain) => chain.chain_name === chainName) as AssetList;
};
export const getStakeCoin = (chainName: string = defaultChainName) => {
    const chainAssets = getChainAssets(chainName);
    return chainAssets.assets[0] as Asset;
  };
  
  export const getGasCoin = (chainName: string = defaultChainName) => {
    const chainAssets = getChainAssets(chainName);
    return chainAssets.assets[1] as Asset;
  };
