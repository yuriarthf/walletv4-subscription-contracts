import { toNano, Address } from 'ton-core';
import { SubscriptionMaster } from '../wrappers/SubscriptionMaster';
import { compile, NetworkProvider } from '@ton-community/blueprint';

const MANAGER = Address.parseFriendly("").address;
const METADATA = {
    name: "AgoraTTS",
    description: "AI module which converts text to speech"
};
const SUBSCRIPTION_FEE = toNano("15");
const PERIODIC_FEE = toNano("5");
const FEE_PERIOD = 2630000n;

export async function run(provider: NetworkProvider) {
    const subscriptionMaster = provider.open(
        SubscriptionMaster.createFromConfig(
            0n,
            await compile('SubscriptionMaster')
        )
    );

    await subscriptionMaster.sendDeploy(
        provider.sender(),
        toNano('0.05'),
        SubscriptionMaster.createSubscriptionMasterInitMsgContent(
            0n,
            METADATA,
            MANAGER,
            SUBSCRIPTION_FEE,
            PERIODIC_FEE,
            FEE_PERIOD,
            await compile("Subscription")
        )
    );

    await provider.waitForDeploy(subscriptionMaster.address);

    console.log('ID', await subscriptionMaster.getID());
}
