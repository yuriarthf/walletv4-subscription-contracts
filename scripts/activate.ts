import { mnemonicToPrivateKey } from 'ton-crypto';
import { WalletContractV4 } from "ton";
import { SubscriptionMaster } from '../wrappers/SubscriptionMaster';
import { Subscription } from '../wrappers/Subscription';
import { compile, NetworkProvider } from '@ton-community/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const wallet_address = provider.sender().address!;
    const keyPair = await mnemonicToPrivateKey(args[0].split(' '));

    const subscriptionMaster = provider.open(SubscriptionMaster.createFromConfig(
        0n,
        await compile('SubscriptionMaster'),
        wallet_address.workChain
    ));

    const subscription = provider.open(Subscription.createFromConfig(
        subscriptionMaster.address,
        wallet_address,
        await compile('Subscription'),
        wallet_address.workChain
    ));

    const wallet = provider.open(WalletContractV4.create({
        workchain: provider.sender().address!.workChain,
        publicKey: keyPair.publicKey
    }));

    if (wallet.address != wallet_address) throw new Error("Mnemonic doesn't match.");

    const feeInfo = await subscription.getFeeInfo();

    console.log(await wallet.send(Subscription.createWalletInstallPluginExtMsg({
        seqno: await wallet.getSeqno(),
        walletId: wallet.walletId,
        pluginAddress: subscription.address,
        activationFee: feeInfo.activationFee,
        secretKey: keyPair.secretKey
    })));
}