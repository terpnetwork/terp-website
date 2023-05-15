

interface NetworkData {
    network: string;
    description: string;
    icon: string;
    name: string;
    status: string;
    wikilink: string;
}

export const networkData: NetworkData[] = [
    // Networks
    {
        network: "Agoric Network",
        description: "An intent-centric, privacy-preserving protocol for decentralized counterparty discovery, solving, and multi-chain atomic settlement.",
        icon: "",
        name: "Network",
        status: "Live",
        wikilink: "https://agoric.com/"
    },
    {
        network: "Akash Network",
        description: "Decentralized Cloud Computing",
        icon: "",
        name: "Network",
        status: "Live",
        wikilink: "https://akash.network/"
    },
    {
        network: "Anoma ",
        description: "An intent-centric, privacy-preserving protocol for decentralized counterparty discovery, solving, and multi-chain atomic settlement.",
        icon: "",
        name: "Network",
        status: "Live",
        wikilink: "https://anoma.net/"
    },
    {
        network: "Axelar Network ",
        description: "EVM Intechain router",
        icon: "",
        name: "Network",
        status: "Live",
        wikilink: "https://axelar.network/"
    },
    {
        network: "Archway Network ",
        description: "EVM Intechain router",
        icon: "",
        name: "Network",
        status: "Live",
        wikilink: "https://axelar.network/"
    },
    {
        network: "Babylon Network ",
        description: "Bringing Bitcoin security to Cosmos and beyond",
        icon: "",
        name: "Network",
        status: "Live",
        wikilink: "https://www.babylonchain.io/"
    },
    {
        network: "Bitsong ",
        description: "Tokenizing music & fan interaction.",
        icon: "",
        name: "Network",
        status: "Live",
        wikilink: "https://bitsong.io/"
    },
    {
        network: "Bitcanna Network ",
        description: "Supply chain logic for cannabis culture",
        icon: "",
        name: "Network",
        status: "Live",
        wikilink: "https://bitcanna.io/"
    },
    {
        network: "Juno Network ",
        description: "Cutting edge CosmWasm.",
        icon: "",
        name: "Network",
        status: "Live",
        wikilink: "https://junonetwork.io"
    },
    {
        network: "Nomic",
        description: "Bringing native BTC to the Cosmos Ecosystem.",
        icon: "",
        name: "Network",
        status: "Live",
        wikilink: "https://nomic.io"
    },
    {
        network: "Osmosis Zone ",
        description: "Interchain AMM & DEX Zone",
        icon: "",
        name: "Network",
        status: "Live",
        wikilink: "https://osmosis.zone/"
    },
    {
        network: "Secret Network ",
        description: "The privacy platform for web3 ",
        icon: "",
        name: "Network",
        status: "Live",
        wikilink: "https://secret.network/"
    },
    {
        network: "Sentienel DVPN ",
        description: "Web3 Cosmos Based Global Decentrlaized Virtual Private Network, built on a P2P bandwidth sharing marketplace. ",
        icon: "",
        name: "Network",
        status: "Live",
        wikilink: "https://sentinel.co/"
    },
    {
        network: "Sommelier ",
        description: "Off-chain Ethereum co-processor.",
        icon: "",
        name: "Network",
        status: "Live",
        wikilink: "https://www.sommelier.finance/"
    },
    {
        network: "Stargaze Network  ",
        description: "The first interoperable Layer 1 for NFTs.",
        icon: "",
        name: "Network",
        status: "Live",
        wikilink: "https://stargaze.zone/"
    },
    {
        network: "DAO DAO",
        description: "An DAO building an app to build DAOs",
        icon: "",
        name: "dApps",
        status: "Live TestNET",
        wikilink: "https://daodao.zone/"
    },
    {
        network: "Interchain Info ",
        description: "Interchain indexer, the wikipedia of the cosmos.",
        icon: "",
        name: "Tools",
        status: "Coming Soon",
        wikilink: "https://interchaininfo.zone/"
    },
    {
        network: "Abstract.io",
        description: "Abstract is a chain-agnostic CosmWasm framework that allows developers to create and monetize decentralized applications using a modular component system.",
        icon: "",
        name: "Tools",
        status: "Coming Soon",
        wikilink: "https://abstract.money/"
    },
    {
        network: "Komple.io ",
        description: "From NFT-based ticketing applications to games with dynamic NFT, with Komple you can create products that leverage the full power of blockchain and NFT technology.",
        icon: "",
        name: "Tools",
        status: "Coming Soon",
        wikilink: "https://komple.io/"
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
        network: "WyndDAO",
        description: "Decentralized Exchange on Juno Network",
        icon: "",
        name: "Defi",
        status: "Coming Soon",
        wikilink: "https://www.wynddao.com//"
    },
    {
        network: "Gelotto.io",
        description: "The first ibc luck based game platform built on Juno",
        icon: "",
        name: "Defi",
        status: "Live TestNET",
        wikilink: "https://gelotto.io/"
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
        network: "Cosmos Directory",
        description: "Terp Network Ecosystem Directory",
        icon: "",
        name: "Explorer",
        status: "Live",
        wikilink: "https://cosmos.directory/terpnetwork"
    },
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
    {
        network: "Code Explorer",
        description: "CosmWasm Code Explorer",
        icon: "",
        name: "dApp",
        status: "Coming Soon",
        wikilink: "https://code.terp.network/"
    },


    // IBC Protocol Resources
    {
        network: "Satelitte Bridge",
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
        network: "Area 52",
        description: " interactive coding platform that teaches you all things CosmWasm, Rust smart contracts, and how to build and deploy your own multichain applications.",
        icon: "",
        name: "Tools",
        status: "Live",
        wikilink: "https://area-52.io/"
    },
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
    {
        network: "Multisig Creator",
        description: "Create on chain multisig with a group of friends to distribute riskof key management.",
        icon: "",
        name: "dApp",
        status: "Coming Soon",
        wikilink: "https://terp.network/gov"
    },
    {
        network: "Staking Interface",
        description: "Stake your Terps to various validators",
        icon: "",
        name: "dApp",
        status: "Coming Soon",
        wikilink: "https://terp.network/stake"
    },
    {
        network: "Governance Dashboard",
        description: "provide your vote to on-chain proposals",
        icon: "",
        name: "dApp",
        status: "Coming Soon",
        wikilink: "https://terp.network/gov"
    },
    {
        network: "Poap Badges",
        description: "Create on chain collectable POAP for your community to collect.",
        icon: "",
        name: "dApp",
        status: "Coming Soon",
        wikilink: "https://terp.network/gov"
    },
    {
        network: "Cross Chain Bridge",
        description: "Bridge any defi asset cross-chain to Terp Network.",
        icon: "",
        name: "dApp",
        status: "Coming Soon",
        wikilink: "https://terp.network/ibc"
    },

]