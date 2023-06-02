import { toNano } from 'ton-core';
import { SubscriptionMaster } from '../wrappers/SubscriptionMaster';
import { NetworkProvider } from '@ton-community/blueprint';

export async function run(provider: NetworkProvider) {
    const subscriptionMaster = provider.open(await SubscriptionMaster.fromInit(BigInt(Math.floor(Math.random() * 10000))));

    await subscriptionMaster.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        {
            $$type: 'Deploy',
            queryId: 0n,
        }
    );

    await provider.waitForDeploy(subscriptionMaster.address);

    console.log('ID', await subscriptionMaster.getId());
}
