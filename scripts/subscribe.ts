import { toNano, Address } from 'ton-core';
import { SubscriptionMaster } from '../wrappers/SubscriptionMaster';
import { compile, NetworkProvider } from '@ton-community/blueprint';
import 'dotenv/config';

export async function run(provider: NetworkProvider) {
    const subscriptionMaster = provider.open(SubscriptionMaster.createFromConfig(
        1n,
        await compile('SubscriptionMaster')
    ));

    console.log(await subscriptionMaster.sendSubscribe(
        provider.sender(),
        toNano('1'),
        0n
    ));
}