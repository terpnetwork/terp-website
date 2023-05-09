import { MouseEventHandler, ReactElement, ReactNode } from "react";

import { AmplitudeEvent } from "../config";

export interface ChooseChainInfo {
  chainName: string
  chainRoute?: string
  label: string
  value: string
  icon?: string
  disabled?: boolean
}

export enum WalletStatus {
  NotInit = 'NotInit',
  Loading = 'Loading',
  Loaded = 'Loaded',
  NotExist = 'NotExist',
  Rejected = 'Rejected',
}

export interface ConnectWalletType {
  buttonText?: string
  isLoading?: boolean
  isDisabled?: boolean
  icon?: ReactNode
  onClickConnectBtn?: MouseEventHandler<HTMLButtonElement>
}

export interface ConnectedUserCardType {
  walletIcon?: string
  username?: string
  icon?: ReactNode
}

export interface FeatureProps {
  title: string
  text: string
  href: string
}

export interface ChainCardProps {
  prettyName: string
  icon?: string
  
}


export type CopyAddressType = {
  address?: string;
  walletIcon?: string;
  isLoading?: boolean;
  maxDisplayLength?: number;
  isRound?: boolean;
  size?: string;
};
export type MainLayoutMenu = {
  label: string;
  link: string | MouseEventHandler;
  icon: string | ReactNode;
  iconSelected?: string;
  selectionTest?: RegExp;
  amplitudeEvent?: AmplitudeEvent;
};

/** PROPS */
export interface InputProps<T> {
  currentValue: T;
  onInput: (value: T) => void;
  autoFocus?: boolean;
  onFocus?: (e: any) => void;
  placeholder?: T;
}

export interface CustomClasses {
  className?: string;
}

export interface LoadingProps {
  isLoading?: boolean;
}

export interface Disableable {
  disabled?: boolean;
}

export type SortDirection = "ascending" | "descending";

export interface Metric {
  label: string;
  value: string | ReactElement;
}

export interface MobileProps {
  isMobile?: boolean;
}

/** Should match settings in tailwind.config.js
 *
 *  https://tailwindcss.com/docs/responsive-design
 */
export const enum Breakpoint {
  SM = 640,
  MD = 768,
  LG = 1024,
  XLG = 1152,
  XL = 1280,
  XLHALF = 1408,
  XXL = 1536,
}

export enum VoteOption {
  YES = 'YES',
  NO = 'NO',
  NWV = 'NWV',
  ABSTAIN = 'ABSTAIN',
}

export enum TransactionResult {
  Success = 0,
  Failed = 1,
}
