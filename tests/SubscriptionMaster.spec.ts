import { Blockchain, SandboxContract } from '@ton-community/sandbox';
import { toNano } from 'ton-core';
import { SubscriptionMaster } from '../wrappers/SubscriptionMaster';
import '@ton-community/test-utils';

describe('SubscriptionMaster', () => {
    let blockchain: Blockchain;
    let subscriptionMaster: SandboxContract<SubscriptionMaster>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        subscriptionMaster = blockchain.openContract(await SubscriptionMaster.fromInit(0n));

        const deployer = await blockchain.treasury('deployer');

        const deployResult = await subscriptionMaster.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
            },
            {
                $$type: 'Deploy',
                queryId: 0n,
            }
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: subscriptionMaster.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and subscriptionMaster are ready to use
    });

    it('should increase counter', async () => {
        const increaseTimes = 3;
        for (let i = 0; i < increaseTimes; i++) {
            console.log(`increase ${i + 1}/${increaseTimes}`);

            const increaser = await blockchain.treasury('increaser' + i);

            const counterBefore = await subscriptionMaster.getCounter();

            console.log('counter before increasing', counterBefore);

            const increaseBy = BigInt(Math.floor(Math.random() * 100));

            console.log('increasing by', increaseBy);

            const increaseResult = await subscriptionMaster.send(
                increaser.getSender(),
                {
                    value: toNano('0.05'),
                },
                {
                    $$type: 'Add',
                    queryId: 0n,
                    amount: increaseBy,
                }
            );

            expect(increaseResult.transactions).toHaveTransaction({
                from: increaser.address,
                to: subscriptionMaster.address,
                success: true,
            });

            const counterAfter = await subscriptionMaster.getCounter();

            console.log('counter after increasing', counterAfter);

            expect(counterAfter).toBe(counterBefore + increaseBy);
        }
    });
});
