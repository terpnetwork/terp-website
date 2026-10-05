// relayer-gas-data.js — known foundation relayer addresses (paint before LCD).
// Keep in sync with public/config.json → ibc.foundationRelayers and public/data/relayer-gas.json.

export const RELAYER_GAS_ACCOUNTS = [
  {
    "setId": "foundation-hermes",
    "setLabel": "Foundation Hermes",
    "chainId": "morocco-1",
    "chainKey": "terp",
    "address": "terp1uhf467vxvqywdmqhagq9rq9wygvwsuzkeaev7c",
    "denom": "uthiol",
    "minSuggested": "100",
    "recommendedDisplay": "100 uthiol (~$0.50)",
    "note": ""
  },
  {
    "setId": "foundation-hermes",
    "setLabel": "Foundation Hermes",
    "chainId": "juno-1",
    "chainKey": "juno",
    "address": "juno1uhf467vxvqywdmqhagq9rq9wygvwsuzkg9nmnh",
    "denom": "ujuno",
    "minSuggested": "1000000",
    "recommendedDisplay": "1 JUNO",
    "note": ""
  },
  {
    "setId": "foundation-hermes",
    "setLabel": "Foundation Hermes",
    "chainId": "osmosis-1",
    "chainKey": "osmosis",
    "address": "osmo1uhf467vxvqywdmqhagq9rq9wygvwsuzkkvrsze",
    "denom": "uosmo",
    "minSuggested": "5000000",
    "recommendedDisplay": "5 OSMO",
    "note": ""
  },
  {
    "setId": "foundation-hermes",
    "setLabel": "Foundation Hermes",
    "chainId": "cosmoshub-4",
    "chainKey": "cosmoshub",
    "address": "cosmos1uhf467vxvqywdmqhagq9rq9wygvwsuzk7hsq5t",
    "denom": "uatom",
    "minSuggested": "1000000",
    "recommendedDisplay": "1 ATOM",
    "note": ""
  },
  {
    "setId": "foundation-hermes",
    "setLabel": "Foundation Hermes",
    "chainId": "akashnet-2",
    "chainKey": "akash",
    "address": "akash1uhf467vxvqywdmqhagq9rq9wygvwsuzknva8d3",
    "denom": "uakt",
    "minSuggested": "5000000",
    "recommendedDisplay": "5 AKT",
    "note": ""
  },
  {
    "setId": "foundation-hermes",
    "setLabel": "Foundation Hermes",
    "chainId": "bitsong-2b",
    "chainKey": "bitsong",
    "address": "bitsong17lx4tzn9y5rvt9slgehcvu48ycchr2gxmz24fr",
    "denom": "ubtsg",
    "minSuggested": "1000000000",
    "recommendedDisplay": "1000 BTSG",
    "note": ""
  },
  {
    "setId": "foundation-hermes",
    "setLabel": "Foundation Hermes",
    "chainId": "penumbra-1",
    "chainKey": "penumbra",
    "address": "penumbra1yycpm5t8eyhxqyv5qh7xt0mtch2qyzu9jrn5kcdxw562ya8fjhvylv4enzsgsxqnfnzt97s9ek4mx3748jz5jhstand8g42074f4hc05qqe9xrh8cywwunjs80tljhvt4f2kwz",
    "denom": "upenumbra",
    "minSuggested": "1000000",
    "recommendedDisplay": "1 PEN",
    "note": "Shielded chain \u2014 fund via Penumbra-compatible wallet / deposit path"
  },
  {
    "setId": "foundation-hermes",
    "setLabel": "Foundation Hermes",
    "chainId": "atomone-1",
    "chainKey": "atomone",
    "address": "atone1uhf467vxvqywdmqhagq9rq9wygvwsuzkshv8zn",
    "denom": "uatone",
    "minSuggested": "1000000",
    "recommendedDisplay": "1 ATONE",
    "note": ""
  },
  {
    "setId": "foundation-hermes",
    "setLabel": "Foundation Hermes",
    "chainId": "jackal-1",
    "chainKey": "jackal",
    "address": "jkl1uhf467vxvqywdmqhagq9rq9wygvwsuzk8f73d5",
    "denom": "ujkl",
    "minSuggested": "10000000",
    "recommendedDisplay": "10 JKL",
    "note": ""
  }
];

export const RELAYER_GAS_NOTE =
  'Public Hermes wallets. Copy an address or Fund it with a bank send from your wallet.';
