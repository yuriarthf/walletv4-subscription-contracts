import { mnemonicToPrivateKey } from 'ton-crypto';
import { WalletContractV4 } from "ton";
import { SubscriptionMaster } from '../wrappers/SubscriptionMaster';
import { Subscription } from '../wrappers/Subscription';
import { compile, NetworkProvider, sleep } from '@ton-community/blueprint';

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

    if (!(await subscription.getIsActivated()))
        throw new Error("Subscription is already deactivated")

    console.log("Subscription Address: " + subscription.address);

    const wallet = provider.open(WalletContractV4.create({
        workchain: userWalletAddress.workChain,
        publicKey: keyPair.publicKey
    }));

    if (!wallet.address.equals(wallet_address)) throw new Error("Mnemonic doesn't match.");

    console.log(await wallet.send(Subscription.createWalletRemovePluginExtMsg({
        seqno: await wallet.getSeqno(),
        walletId: wallet.walletId,
        pluginAddress: subscription.address,
        secretKey: keyPair.secretKey
    })));
    
    const msg = Subscription.createWalletRemovePluginExtMsg({
        seqno: await wallet.getSeqno(),
        walletId: wallet.walletId,
        pluginAddress: subscription.address,
        secretKey: keyPair.secretKey
    });
    
    await wallet.send(msg);

    await sleep(5000);

    console.log(await subscription.getIsActivated() ? "Deactivation failed" : "Deactivation successful");
}