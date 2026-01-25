# Cardano Discord Introduction Post

For sharing NACHO Stake Pool and NACHO API with the Cardano developer community.

---

**Hey everyone 👋**

I've been working on a couple of Cardano projects and wanted to share them with the community in case they're useful to anyone.

**NACHO Stake Pool** (https://nacho.builders) - A small, independent stake pool I've been running. Nothing fancy, just trying to contribute to network decentralization in my own way.

**NACHO API** (https://app.nacho.builders) - A Cardano API service I built for developers who need access to node data without running their own infrastructure. The API is powered by the same relay nodes that run the stake pool, so you're connecting to real infrastructure that's actively participating in the network.

Features include:
- **Ogmios WebSocket API** - Full access to the Ogmios JSON-WSP interface for chain queries, mempool monitoring, and transaction submission
- **Chain Synchronization** - Stream blocks from any point on the chain using Ogmios's ChainSync mini-protocol, useful for wallets, explorers, or anything that needs to follow the chain in real-time
- **Cardano Submit API** - Submit signed transactions directly
- **GraphQL** - Query blockchain data via DB-Sync and Hasura
- **Pay with ADA** - No fiat payments or KYC required, just pay with ADA for the credits you need

The checkout process actually uses the API itself to sync with the chain, monitor for incoming payments, verify confirmations, and credit your account automatically. Felt like a good way to dogfood my own service and prove it works.

This is still very much a work in progress. I built it mostly to scratch my own itch and learn more about the Cardano stack, but I'd genuinely appreciate any feedback from folks who try it out.

Happy to answer questions or hear suggestions on what would make it more useful for developers here.
