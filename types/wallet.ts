import { MouseEventHandler, ReactNode, RefObject } from "react";

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

  