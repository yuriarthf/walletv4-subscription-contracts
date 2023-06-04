import { Blockchain, SandboxContract } from '@ton-community/sandbox';
import { Cell, toNano } from 'ton-core';
import { SubscriptionMaster } from '../wrappers/SubscriptionMaster';
import '@ton-community/test-utils';
import { compile } from '@ton-community/blueprint';

describe('SubscriptionMaster', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('SubscriptionMaster');
    });

    let blockchain: Blockchain;
    let subscriptionMaster: SandboxContract<SubscriptionMaster>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        subscriptionMaster = blockchain.openContract(
            SubscriptionMaster.createFromConfig(
                {
                    id: 0,
                    counter: 0,
                },
                code
            )
        );

        const deployer = await blockchain.treasury('deployer');

        const deployResult = await subscriptionMaster.sendDeploy(deployer.getSender(), toNano('0.05'));

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

            const increaseBy = Math.floor(Math.random() * 100);

            console.log('increasing by', increaseBy);

            const increaseResult = await subscriptionMaster.sendIncrease(increaser.getSender(), {
                increaseBy,
                value: toNano('0.05'),
            });

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
