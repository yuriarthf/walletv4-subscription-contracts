import { SubscriptionMaster } from '../wrappers/SubscriptionMaster';
import { Subscription } from '../wrappers/Subscription';
import { Address } from 'ton';
import { compile, NetworkProvider } from '@ton-community/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const subscriptionMaster = provider.open(SubscriptionMaster.createFromConfig(
        1n,
        await compile('SubscriptionMaster')
    ));

    console.log("Subscription Master Address: " + subscriptionMaster.address);

    const userSubscriptionAddress = await subscriptionMaster.getUserSubscription(
        Address.parse(args[0])
    );
    console.log("User Subscription Address: " + userSubscriptionAddress);

    const userSubscription = provider.open(Subscription.createFromAddress(userSubscriptionAddress));

    console.log("Initialized: " + await userSubscription.getIsInit())
    console.log("Activated: " + await userSubscription.getIsActivated());
    console.log("Paymend due: " + await userSubscription.getIsPaymentDue());
    console.log("Fulfilled: " + await userSubscription.getIsFulfilled());
    console.log("Fee Info:");
    console.log(await userSubscription.getFeeInfo());
}