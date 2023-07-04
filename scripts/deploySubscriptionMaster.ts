import { toNano } from 'ton-core';
import { SubscriptionMaster } from '../wrappers/SubscriptionMaster';
import { compile, NetworkProvider } from '@ton-community/blueprint';

export async function run(provider: NetworkProvider) {
    const subscriptionMaster = provider.open(
        SubscriptionMaster.createFromConfig(
            {
                id: Math.floor(Math.random() * 10000),
            },
            await compile('SubscriptionMaster')
        )
    );

    await subscriptionMaster.sendDeploy(provider.sender(), toNano('0.05'));

    await provider.waitForDeploy(subscriptionMaster.address);

    console.log('ID', await subscriptionMaster.getID());
}
