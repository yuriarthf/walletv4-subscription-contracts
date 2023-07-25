import { Blockchain, SandboxContract, TreasuryContract } from "@ton-community/sandbox";
import { Cell, toNano } from "ton-core";
import { SubscriptionMaster, assembleSubscriptionMetadata } from "../wrappers/SubscriptionMaster";
import { Subscription } from "../wrappers/Subscription";
import "@ton-community/test-utils";
import { compile } from "@ton-community/blueprint";

describe("SubscriptionMaster", () => {
    let manager: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;
    let user2: SandboxContract<TreasuryContract>;
    let blockchain: Blockchain;
    let subscriptionMasterCode: Cell;
    let subscriptionCode: Cell;
    let subscriptionMaster: SandboxContract<SubscriptionMaster>;

    const METADATA = {
        name: "SubscriptionMasterTest",
        description: "Unit test deployment"
    };
    const ACTIVATION_FEE = toNano("15");
    const PERIODIC_FEE = toNano("5");
    const FEE_PERIOD = 2630000n;

    const MIN_TON_RESERVE = 50000000n;

    beforeAll(async () => {
        blockchain = await Blockchain.create();

        manager = await blockchain.treasury("deployer");
        user = await blockchain.treasury("user");
        user2 = await blockchain.treasury("user2");

        subscriptionMasterCode = await compile('SubscriptionMaster');
        subscriptionCode = await compile('Subscription');

        subscriptionMaster = blockchain.openContract(
            SubscriptionMaster.createFromConfig(0n, subscriptionMasterCode)
        );
    });

    it("should deploy", async () => {
        const deployResult = await subscriptionMaster.sendDeploy(
            manager.getSender(),
            toNano('0.5'),
            SubscriptionMaster.createSubscriptionMasterInitMsgContent(
                0n,
                METADATA,
                manager.getSender().address,
                ACTIVATION_FEE,
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

        expect(await subscriptionMaster.getIsInit()).toBeTruthy();
    });

    it("Check post-init data and balance (=MIN_TON_STORAGE)", async () => {
        const data = await subscriptionMaster.getSubscriptionMasterData();

        const expectedResult = {
            index: 0n,
            metadata: assembleSubscriptionMetadata(METADATA),
            manager: manager.address,
            subscriptionCounter: 0n,
            activationFee: ACTIVATION_FEE,
            periodicFee: PERIODIC_FEE,
            subscriptionCode
        } as {[field: string]: any};

        expect(data.index).toEqual(expectedResult.index);
        expect(data.metadata).toEqualCell(expectedResult.metadata);
        expect(data.manager).toEqualAddress(expectedResult.manager);
        expect(data.subscriptionCounter).toEqual(expectedResult.subscriptionCounter);
        expect(data.activationFee).toEqual(expectedResult.activationFee);
        expect(data.periodicFee).toEqual(expectedResult.periodicFee);
        expect(data.subscriptionCode).toEqualCell(expectedResult.subscriptionCode);

        expect(await subscriptionMaster.getBalance()).toEqual(MIN_TON_RESERVE);
    });

    it("op::configure", async () => {
        const newactivationFee = toNano("10");
        const newPeriodicFee = toNano("4");
        const newFeePeriod = 1315000n;

        await subscriptionMaster.sendConfigure(
            manager.getSender(),
            toNano("0.5"),
            SubscriptionMaster.formatConfiguration(
                0n,
                newactivationFee,
                newPeriodicFee,
                newFeePeriod
            )
        );

        let data = await subscriptionMaster.getFeeConfig();

        expect(data.activationFee).toEqual(newactivationFee);
        expect(data.periodicFee).toEqual(newPeriodicFee);
        expect(data.feePeriod).toEqual(newFeePeriod);

        await subscriptionMaster.sendConfigure(
            manager.getSender(),
            toNano("0.5"),
            SubscriptionMaster.formatConfiguration(
                1n,
                ACTIVATION_FEE,
                PERIODIC_FEE,
                FEE_PERIOD
            )
        );

        data = await subscriptionMaster.getFeeConfig();

        expect(data.activationFee).toEqual(ACTIVATION_FEE);
        expect(data.periodicFee).toEqual(PERIODIC_FEE);
        expect(data.feePeriod).toEqual(FEE_PERIOD);
    });

    it("op::change_manager", async () => {
        const newManager = await blockchain.treasury("newManager");

        await subscriptionMaster.sendChangeManager(
            manager.getSender(),
            toNano("0.5"),
            newManager.address,
            0n
        );

        expect(await subscriptionMaster.getManager()).toEqualAddress(newManager.address);

        await subscriptionMaster.sendChangeManager(
            newManager.getSender(),
            toNano("0.5"),
            manager.address,
            1n
        );

        expect(await subscriptionMaster.getManager()).toEqualAddress(manager.address);
    });

    it("op::subscribe", async () => {
        const prevSubscriptionCounter = await subscriptionMaster.getSubscriptionCounter();

        await subscriptionMaster.sendSubscribe(
            user.getSender(),
            toNano("1.5"),
            0n
        );

        expect(await subscriptionMaster.getSubscriptionCounter()).toEqual(prevSubscriptionCounter + 1n);

        const subscriptionAddr = await subscriptionMaster.getUserSubscription(user.address);

        const subscription = blockchain.openContract(Subscription.createFromAddress(subscriptionAddr));

        expect(await subscription.getBalance()).toEqual(MIN_TON_RESERVE);

        const subscriptionData = await subscription.getSubscriptionData();

        const expectedResult = {
            subscriptionMaster: subscriptionMaster.address,
            owner: user.address,
            manager: manager.address,
            activationFee: ACTIVATION_FEE,
            fee: PERIODIC_FEE,
            period: FEE_PERIOD,
            activated: false
        }

        expect(subscriptionData.subscriptionMaster).toEqualAddress(expectedResult.subscriptionMaster);
        expect(subscriptionData.owner).toEqualAddress(expectedResult.owner);
        expect(subscriptionData.manager).toEqualAddress(expectedResult.manager);
        //expect(subscriptionData.activationFee).toEqual(expectedResult.activationFee);
        expect(subscriptionData.fee).toEqual(expectedResult.fee);
        expect(subscriptionData.period).toEqual(expectedResult.period);
        expect(subscriptionData.activated).toEqual(expectedResult.activated);
    });
});
