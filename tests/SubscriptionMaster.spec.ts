import { Blockchain, SandboxContract, TreasuryContract } from "@ton-community/sandbox";
import { Cell, toNano } from "ton-core";
import { SubscriptionMaster } from "../wrappers/SubscriptionMaster";
import "@ton-community/test-utils";
import { compile } from "@ton-community/blueprint";

describe("SubscriptionMaster", () => {
    let manager: SandboxContract<TreasuryContract>;
    let blockchain: Blockchain;
    let subscriptionMasterCode: Cell;
    let subscriptionCode: Cell;
    let subscriptionMaster: SandboxContract<SubscriptionMaster>;

    beforeAll(async () => {
        subscriptionMasterCode = await compile('SubscriptionMaster');
        subscriptionCode = await compile('Subscription');

        blockchain = await Blockchain.create();

        subscriptionMaster = blockchain.openContract(
            SubscriptionMaster.createFromConfig(0n, subscriptionMasterCode)
        );

        manager = await blockchain.treasury("deployer");
    });

    it("should deploy", async () => {
        const deployResult = await subscriptionMaster.sendDeploy(
            manager.getSender(),
            toNano('0.05'),
            SubscriptionMaster.createSubscriptionMasterInitMsgContent(
                0n,
                {
                    name: "SubscriptionMasterTest",
                    description: "Unit test deployment"
                },
                manager.getSender().address,
                toNano("15"),
                toNano("5"),
                2630000n,
                subscriptionCode
            )
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: manager.address,
            to: subscriptionMaster.address,
            deploy: true,
            success: true,
        });
    });

    it("Check post-init data", async () => {
        const data = await subscriptionMaster.getSubscriptionMasterData()
        console.log(data);
    });
});
