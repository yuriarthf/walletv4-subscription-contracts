![Static Badge](https://img.shields.io/badge/FunC-1) ![Static Badge](https://img.shields.io/badge/typescript-red)  ![Static Badge](https://img.shields.io/badge/ton--core-0.49.0-blue)
<h1>📜 Agora Subscription Contracts</h1>

This repository contains the contracts associated with the Agora AI subscription. The Subscription Master contract holds descriptive information about the service (metadata), the manager (can change subscription configuration and request for payments) and other information related to the fees requested by the service. The Subscription contract serves as a payment medium between the service creator and the user wallet.

### Main technical features

- Subscription verification to be used on [AgoraAI backend](https://github.com/Hack-a-TONx/agora-ai-modules) verification.
- `op::subscribe` to be called on the [AgoraAI WebApp](https://github.com/Hack-a-TONx/twaps).
- User's subscriptions are retrievable by wallet address, through the service's Subscription Master contract.
- New "subscription created" logs are stored as external-out messages in the Subscription Master shardchain.
- All these are connected and accessible on [AgoraAI Bot](https://github.com/Hack-a-TONx/agora-module-bots)

## 🏗 Architecture Overview
Each AI service present in the Agora Marketplace will be bound to a Subscription Master contract. In order for the user to get access to the service, the user will need to subscribe to it. 

<p align="center">
  <img src="assets/ai_subscription_module.png" alt="AI Subscription Module"/>
</p>
<p align="center">User subscription flow: Each user will be associated to a different subscription contract to distribute message load</p>

After subscription, one more step is necessary by the user, install the plugin (give permission to subscription contract to subtract funds from it). Note that an `activation_fee` will be charged for the first time, after that the user will be charged a smaller `period_fee`.

If the the user doesn't want to make use of the service anymore, a remove plugin operation can be performed on the user wallet (deactivating the subscription contract).  
**Notice**: If the user wishes to activate the service again, the `activation_fee` will need to be paid once again.

<p align="center">
  <img src="assets/user_subscription_management.png" alt="User Subscription Management Flows"/>
</p>
<p align="center">User needs to activate subscription to use the service and deactivate to seize payments, losing access to the service</p>

Lastly, Agora Keeper will maintain the subscriptions, by caching and managing on-chain user data and request payments from subscriptions periodically and automatically for AI creators.

<p align="center">
  <img src="assets/payment_flow.png" alt="Periodic Payment Execution Flow"/>
</p>
<p align="center">Agora Keeper requests payments from all subscriptions associated with all services bound by a Subscription Master</p>

## 📂 Project structure

-   `contracts` - source code of all the smart contracts of the project and their dependencies.
-   `wrappers` - wrapper classes (implementing `Contract` from ton-core) for the contracts, including any [de]serialization primitives and compilation functions.
-   `tests` - tests for the contracts.
-   `scripts` - scripts used by the project, mainly the deployment scripts.

## 🛠 How to use

### Build (using npx or yarn)

`[npx/yarn] blueprint build`

### 🧪 Test

`[npx/yarn] blueprint test`

### 🚀 Deploy Subscription Master

`[npx/yarn] blueprint run deploySubscriptionMaster [--testnet/--mainnet]`

**OBS**: After executing the deploy script, it will be asked interactively which method to use to sign the transaction, tonconnect, tonhub, deeplink or mnemonic.
