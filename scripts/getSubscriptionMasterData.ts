import { SubscriptionMaster } from '../wrappers/SubscriptionMaster';
import { Address } from 'ton';
import { compile, NetworkProvider } from '@ton-community/blueprint';

export async function run(provider: NetworkProvider) {
    const subscriptionMaster = provider.open(SubscriptionMaster.createFromConfig(
        1n,
        await compile('SubscriptionMaster')
    ));

    console.log("Contract Address: " + subscriptionMaster.address);
    console.log("Initialized: " + await subscriptionMaster.getIsInit());
    console.log(await subscriptionMaster.getSubscriptionMasterData());
}