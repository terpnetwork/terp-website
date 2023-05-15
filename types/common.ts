
export enum TransactionResult {
    Success = 0,
    Failed = 1,
  }


export interface Balance {
    denom: string;
    symbol: string;
    amount: string;
    displayAmount: number;
    logoUrl?: string;
  }

  export interface FeatureProps {
    title: string
    text: string
    href: string
  }

  export type CopyAddressType = {
    address?: string;
    walletIcon?: string;
    isLoading?: boolean;
    maxDisplayLength?: number;
    isRound?: boolean;
    size?: string;
  };