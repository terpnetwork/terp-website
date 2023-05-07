

interface NetworkData {
    network: string;
    description: string;
    icon: string;
    name: string;
    status: string;
    wikilink: string;
  }

  export const networkData: NetworkData[] = [
    {
      network: "Code Explorer",
      description: "CosmWasm Code Explorer",
      icon: "",
      name: "dApp",
      status: "Live TestNET",
      wikilink: "https://code.terp.network/"
    },
    {
      network: "DAODAO",
      description: "An app for creating DAO's",
      icon: "",
      name: "dApp",
      status: "Live TestNET",
      wikilink: "https://daodao.terp.network/"
    },
    {
      network: "WasmSwap",
      description: "Decentralised Exchange",
      icon: "",
      name: "Defi",
      status: "Coming Soon",
      wikilink: "https://sifchain.network/"
    },
    {
      network: "Keplr",
      description: "Cosmos Ecosystem wallet",
      icon: "",
      name: "Wallet",
      status: "Live TestNET",
      wikilink: "https://wallet.keplr.app/"
    },
    {
        network: "Leap",
        description: "Cosmos Ecosystem wallet",
        icon: "",
        name: "Wallet",
        status: "Live TestNET",
        wikilink: "https://www.leapwallet.io/"
    },
    {
        network: "CypherD",
        description: "Cosmos Ecosystem wallet",
        icon: "",
        name: "Wallet",
        status: "Coming Soon",
        wikilink: "https://www.cypherwallet.io/"
    },
    {
        network: "Cosmostation",
        description: "Cosmos Ecosystem wallet",
        icon: "",
        name: "Wallet",
        status: "Coming Soon",
        wikilink: "https://www.cosmostation.io/"
    },
    {
        network: "Ledger",
        description: "Hardware Wallet",
        icon: "",
        name: "Wallet",
        status: "Live TestNET",
        wikilink: "https://www.ledger.com"
    },
    // Block Explorers & Tooling
    {
        network: "Zenscan",
        description: "Terp Network Ecosystem Explorer",
        icon: "",
        name: "Explorer",
        status: "Live TestNET",
        wikilink: "https://www.terp.zenscan.io"
    },
    {
        network: "KjNodes Explorer",
        description: "Terp Network Ecosystem Explorer",
        icon: "",
        name: "Explorer",
        status: "Live TestNET",
        wikilink: "https://explorer.kjnodes.com/terp-testnet"
    },
    {
        network: "NodeJumper Explorer",
        description: "Terp Network Ecosystem Explorer",
        icon: "",
        name: "Explorer Tools",
        status: "Live TestNET",
        wikilink: "https://nodejumper.io/terpnetwork-testnet"
    },
    {
        network: "Highstakes Snapshot",
        description: "Terp Network Ecosystem Explorer",
        icon: "",
        name: "Tools",
        status: "Live TestNET",
        wikilink: "https://tools.highstakes.ch/snapshots"
    },
    
    
    // IBC Protocol Resources
        {
            network: "Satelitte Network",
            description: "Cross Chain Routing",
            icon: "",
            name: "Tools",
            status: "Coming Soon",
            wikilink: "https://satellite.money/"
        },
        {
            network: "Gravity Bridge",
            description: "Trustless bridge between Ethereum and the Cosmos ecosystem",
            icon: "",
            name: "Tools",
            status: "Coming Soon",
            wikilink: "https://spacestation.zone/"
        },
        // Community Developed Apps
        {
            network: "Judging App: Legends of Hashish",
            description: "Decentralised voting framework",
            icon: "",
            name: "dApp",
            status: "Live",
            wikilink: "https://glassflow.xyz"
        },
        {
            network: "GlassFlow",
            description: "Multi-utility NFT marketplace",
            icon: "",
            name: "dApp",
            status: "Coming Soon",
            wikilink: "https://glassflow.io/"
        },
    
    ]