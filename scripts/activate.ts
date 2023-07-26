import { mnemonicToPrivateKey, sign } from 'ton-crypto';
import { WalletContractV4, Builder} from "ton";
import { SubscriptionMaster } from '../wrappers/SubscriptionMaster';
import { Subscription } from '../wrappers/Subscription';
import { compile, NetworkProvider, sleep } from '@ton-community/blueprint';
import 'dotenv/config';

export async function run(provider: NetworkProvider, args: string[]) {
    const mnemonic = process.env.WALLET_MNEMONIC ?? (args.length > 0 ? args[0] : undefined);
    if (!mnemonic) throw new Error("Mnemonic should be provided as 'WALLET_MNEMONIC' env or as a script param ");
    const keyPair = await mnemonicToPrivateKey(mnemonic.split(' '));

    const subscriptionMaster = provider.open(SubscriptionMaster.createFromConfig(
        1n,
        await compile('SubscriptionMaster')
    ));

    const userWalletAddress = provider.sender().address!;
    const subscription = provider.open(Subscription.createFromAddress(
        await subscriptionMaster.getUserSubscription(userWalletAddress)
    ));

    if (await subscription.getIsActivated())
        throw new Error("Subscription is already activated")

    console.log("Subscription Address: " + subscription.address);

    const wallet = provider.open(WalletContractV4.create({
        workchain: userWalletAddress.workChain,
        publicKey: keyPair.publicKey
    }));

    if (!wallet.address.equals(userWalletAddress)) throw new Error("Mnemonic doesn't match.");

    const feeInfo = await subscription.getFeeInfo();
    console.log("Fee to pay: " + feeInfo.activationFee);

    const seqno = await wallet.getSeqno();
    console.log("seqno: " + seqno);

    const timeout = BigInt(Math.floor(Date.now() / 1e3) + 72000);
    console.log('Timeout: ' + timeout);
    const activateSubscriptionBody = subscription.createActivateSubscriptionExtMsgBody({
        seqno: await wallet.getSeqno(),
        walletId: wallet.walletId,
        activationFee: feeInfo.activationFee,
        timeout: timeout
    }) as Builder;

    const signature = sign(activateSubscriptionBody.endCell().hash(), keyPair.secretKey);
    console.log('signature: ' + signature.toString('base64'));

    await wallet.send(Subscription.createWalletExtMsgBody(signature, activateSubscriptionBody));

    await sleep(15000);

    console.log(await subscription.getIsActivated() ? "Activation successful" : "Activation failed");
}