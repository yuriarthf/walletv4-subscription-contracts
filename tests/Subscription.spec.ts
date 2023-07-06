import { Blockchain, SandboxContract, TreasuryContract } from "@ton-community/sandbox";
import { Cell, beginCell, toNano } from "ton-core";
import { Subscription } from "../wrappers/Subscription";
import "@ton-community/test-utils";
import { compile } from "@ton-community/blueprint";

(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

describe("Subscription", () => {
    let subscriptionMasterMock: SandboxContract<TreasuryContract>;
    let owner: SandboxContract<TreasuryContract>;
    let manager: SandboxContract<TreasuryContract>;
    let blockchain: Blockchain;
    let subscriptionCode: Cell;
    let subscription: SandboxContract<Subscription>;

    const ACTIVATION_FEE = toNano("15");
    const FEE = toNano("5");
    const PERIOD = 2630000n;

    const MIN_TON_RESERVE = 50000000n;

    beforeAll(async () => {
        blockchain = await Blockchain.create();


        subscriptionMasterMock = await blockchain.treasury("subscriptionMasterMock");
        owner = await blockchain.treasury("owner");
        manager = await blockchain.treasury("manager");

        subscriptionCode = await compile('Subscription');

        subscription = blockchain.openContract(
            Subscription.createFromConfig(
                subscriptionMasterMock.address,
                owner.address,
                subscriptionCode,
                0
            )
        );
    });

    it("should deploy", async () => {
        const deployResult = await subscription.sendDeploy(
            subscriptionMasterMock.getSender(),
            toNano('0.5'),
            Subscription.createSubscriptionInitMsgContent(
                0n,
                manager.address,
                ACTIVATION_FEE,
                FEE,
                PERIOD
            )
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: subscriptionMasterMock.address,
            to: subscription.address,
            deploy: true,
            success: true,
        });
    });
});
