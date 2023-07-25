import { SubscriptionMaster } from '../wrappers/SubscriptionMaster';
import { Subscription } from '../wrappers/Subscription';
import { compile, NetworkProvider, sleep } from '@ton-community/blueprint';
import 'dotenv/config';

export async function run(provider: NetworkProvider) {
    const subscriptionMaster = provider.open(SubscriptionMaster.createFromConfig(
        0n,
        await compile('SubscriptionMaster')
    ));

    const activationFee = (await subscriptionMaster.getFeeConfig()).activationFee;

    await subscriptionMaster.sendSubscribeAndActivate(
        provider.sender(),
        activationFee,
        0n
    );

    await sleep(10000);

    const userWalletAddress = provider.sender().address!;
    const subscription = provider.open(Subscription.createFromAddress(
        await subscriptionMaster.getUserSubscription(userWalletAddress)
    ));

    console.log(await subscription.getIsActivated() ? "Activation successful" : "Activation failed");
}