import { Blockchain, SandboxContract, TreasuryContract } from "@ton-community/sandbox";
import { Cell, beginCell, toNano } from "ton-core";
import { SubscriptionMaster, assembleSubscriptionMetadata } from "../wrappers/SubscriptionMaster";
import "@ton-community/test-utils";
import { compile } from "@ton-community/blueprint";

(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

describe("SubscriptionMaster", () => {
    let manager: SandboxContract<TreasuryContract>;
    let blockchain: Blockchain;
    let subscriptionMasterCode: Cell;
    let subscriptionCode: Cell;
    let subscriptionMaster: SandboxContract<SubscriptionMaster>;

    const METADATA = {
        name: "SubscriptionMasterTest",
        description: "Unit test deployment"
    };
    const SUBSCRIPTION_FEE = toNano("15");
    const PERIODIC_FEE = toNano("5");
    const FEE_PERIOD = 2630000n;

    const MIN_TON_RESERVE = 50000000n;

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
            toNano('0.5'),
            SubscriptionMaster.createSubscriptionMasterInitMsgContent(
                0n,
                METADATA,
                manager.getSender().address,
                SUBSCRIPTION_FEE,
                PERIODIC_FEE,
                FEE_PERIOD,
                subscriptionCode
            )
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: manager.address,
            to: subscriptionMaster.address,
            deploy: true,
            success: true,
        });

        expect(subscriptionMaster)
    });

    it("Check post-init data and balance (=MIN_TON_STORAGE)", async () => {
        const data = await subscriptionMaster.getSubscriptionMasterData();

        const expectedResult = {
            index: 0n,
            metadata: assembleSubscriptionMetadata(METADATA),
            manager: manager.address,
            subscriptionNumber: 0n,
            subscriptionFee: SUBSCRIPTION_FEE,
            periodicFee: PERIODIC_FEE,
            subscriptionCode
        } as {[field: string]: any};

        expect(data.index).toEqual(expectedResult.index);
        expect(data.metadata).toEqualCell(expectedResult.metadata);
        expect(data.manager).toEqualAddress(expectedResult.manager);
        expect(data.subscriptionNumber).toEqual(expectedResult.subscriptionNumber);
        expect(data.subscriptionFee).toEqual(expectedResult.subscriptionFee);
        expect(data.periodicFee).toEqual(expectedResult.periodicFee);
        expect(data.subscriptionCode).toEqualCell(expectedResult.subscriptionCode);

        expect(await subscriptionMaster.getBalance()).toEqual(MIN_TON_RESERVE);
    });

    it("op::configure", async () => {
        const newSubscriptionFee = toNano("10");
        const newPeriodicFee = toNano("4");
        const newFeePeriod = 1315000n;

        await subscriptionMaster.sendConfigure(
            manager.getSender(),
            toNano("0.5"),
            SubscriptionMaster.formatConfiguration(
                0n,
                newSubscriptionFee,
                newPeriodicFee,
                newFeePeriod
            )
        );

        const data = await subscriptionMaster.getFeeConfig();

        expect(data.subscriptionFee).toEqual(newSubscriptionFee);
        expect(data.periodicFee).toEqual(newPeriodicFee);
        expect(data.feePeriod).toEqual(newFeePeriod);
    });
});
