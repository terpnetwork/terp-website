export type EventProperties = {
    fromToken: string;
    toToken: string;
    isOnHome: boolean;
    percentage: string;
    filteredBy: string;
    isFilterOn: boolean;
    sortedBy: string;
    sortedOn: "table-head" | "dropdown" | "table";
    sortDirection: string;
    isSingleAsset: boolean;
    unbondingPeriod: number;
    validatorName: string;
    validatorCommission: number;
    isOn: boolean;
    tokenName: string;
    tokenAmount: number;
    bridge: string;
    hasExternalUrl: boolean;
    avatar: "ammelia" | "wosmongton";
  };
  
  export type UserProperties = {
    isWalletConnected: boolean;
    connectedWallet: string;
    totalAssetsPrice: number;
    unbondedAssetsPrice: number;
    bondedAssetsPrice: number;
    stakedTerpPrice: number;
    terpBalance: number;
    thiolBalance: number;
  };
  
  export type AmplitudeEvent =
    | [
        eventName: string,
        eventProperties: Partial<Record<keyof EventProperties, any>> | undefined
      ]
    | [eventName: string];
  
  export const EventName = {
    // Events in Swap UI and page
    Swap: {
      pageViewed: "Swap: Page viewed",
      maxClicked: "Swap: Max clicked",
      halfClicked: "Swap: Half clicked",
      inputEntered: "Swap: Input entered",
      switchClicked: "Swap: Switch clicked",
      dropdownAssetSelected: "Swap: Dropdown asset selected",
    },
    // Events in Sidebar UI
    Sidebar: {
      stakeClicked: "Sidebar: Stake clicked",
      voteClicked: "Sidebar: Vote clicked",
      infoClicked: "Sidebar: Info clicked",
      supportClicked: "Sidebar: Support clicked",
    },
    // Events in Topnav UI
    Topnav: {
      connectWalletClicked: "Topnav: Connect wallet clicked",
      signOutClicked: "Topnav: Sign out clicked",
    },
    // Events in Pools page
   
    // Events in Pool detail page
   
    // Events in assets page
    Assets: {
      pageViewed: "Assets: Page viewed",
      depositClicked: "Assets: Deposit clicked",
      withdrawClicked: "Assets: Withdraw clicked",
    
      assetsListFiltered: "Assets: Assets list filtered",
      assetsListSorted: "Assets: Assets list sorted",
      assetsListMoreClicked: "Assets: Assets list more clicked",
      assetsItemDepositClicked: "Assets: Assets item deposit clicked",
      assetsItemWithdrawClicked: "Assets: Assets item withdraw clicked",
      depositAssetStarted: "Deposit asset: Deposit started",
      depositAssetCompleted: "Deposit asset: Deposit completed",
      withdrawAssetStarted: "Withdraw asset: Withdraw started",
      withdrawAssetCompleted: "Withdraw asset: Withdraw completed",
    },
    // Events in profile modal
    ProfileModal: {
      selectAvatarClicked: "Profile Modal: Select Avatar clicked",
      qrCodeClicked: "Profile Modal: QR code clicked",
      logOutClicked: "Profile Modal: Log out clicked",
      copyWalletAddressClicked: "Profile Modal: Copy wallet address clicked",
      buyTokensClicked: "Profile Modal: Buy tokens clicked",
      blockExplorerLinkOutClicked:
        "Profile Modal: Block explorer link-out clicked",
    },
  };