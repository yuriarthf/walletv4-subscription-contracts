import { mnemonicToPrivateKey } from 'ton-crypto';
import { WalletContractV4, Address } from "ton";
import { SubscriptionMaster } from '../wrappers/SubscriptionMaster';
import { Subscription } from '../wrappers/Subscription';
import { compile, NetworkProvider } from '@ton-community/blueprint';
import 'dotenv/config';

export async function run(provider: NetworkProvider, args: string[]) {
    const mnemonic = process.env.WALLET_MNEMONIC ?? (args.length > 0 ? args[0] : undefined);
    if (!mnemonic) throw new Error("Mnemonic should be provided as 'WALLET_MNEMONIC' env or as a script param ");
    const wallet_address = provider.sender().address!;
    const keyPair = await mnemonicToPrivateKey(mnemonic.split(' '));

    const subscriptionMaster = provider.open(SubscriptionMaster.createFromConfig(
        0n,
        await compile('SubscriptionMaster')
    ));

    const userWalletAddress = provider.sender().address!;
    const subscription = provider.open(Subscription.createFromAddress(
        await subscriptionMaster.getUserSubscription(userWalletAddress)
    ));

    console.log("Subscription Address: " + subscription.address);

    const wallet = provider.open(WalletContractV4.create({
        workchain: userWalletAddress.workChain,
        publicKey: keyPair.publicKey
    }));

    if (!wallet.address.equals(wallet_address)) throw new Error("Mnemonic doesn't match.");

    const feeInfo = await subscription.getFeeInfo();
    console.log("Fee to pay: " + feeInfo.activationFee);

    const msg = Subscription.createWalletInstallPluginExtMsg({
        seqno: await wallet.getSeqno(),
        walletId: wallet.walletId,
        pluginAddress: subscription.address,
        activationFee: feeInfo.activationFee,
        secretKey: keyPair.secretKey
    });
    
    await wallet.send(msg);

    const isActivated = await subscription.getIsActivated();
    console.log(isActivated ? "Activation successful" : "Activation failed");
}