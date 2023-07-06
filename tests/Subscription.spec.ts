import {
    Blockchain,
    SandboxContract,
    TreasuryContract,
    
} from "@ton-community/sandbox";
import { Cell, beginCell, toNano, SendMode } from "ton-core";
import { mnemonicNew, mnemonicToPrivateKey } from "ton-crypto"
import { WalletContractV4 } from "ton";
import { Subscription } from "../wrappers/Subscription";
import "@ton-community/test-utils";
import { compile } from "@ton-community/blueprint";

(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

describe("Subscription", () => {
    let subscriptionMasterMock: SandboxContract<TreasuryContract>;
    let owner: SandboxContract<WalletContractV4>;
    let manager: SandboxContract<TreasuryContract>;
    let blockchain: Blockchain;
    let subscriptionCode: Cell;
    let subscription: SandboxContract<Subscription>;

    const ACTIVATION_FEE = toNano("15");
    const FEE = toNano("5");
    const PERIOD = 2630000n;

    const WORKCHAIN_ID = 0;
    const MIN_TON_RESERVE = 50000000n;

    beforeAll(async () => {
        blockchain = await Blockchain.create();

        subscriptionMasterMock = await blockchain.treasury("subscriptionMasterMock");
        manager = await blockchain.treasury("manager");

        const ownerDonator = await blockchain.treasury("ownerDonator");

        const mnemonic = await mnemonicNew();
        const keyPair = await mnemonicToPrivateKey(mnemonic);
        owner = blockchain.openContract(WalletContractV4.create({
            workchain: WORKCHAIN_ID,
            publicKey: keyPair.publicKey
        }));

        ownerDonator.send({
            value: 0n,
            to: owner.address,
            sendMode: SendMode.CARRY_ALL_REMAINING_BALANCE 
                + SendMode.DESTROY_ACCOUNT_IF_ZERO,
            bounce: false,
        });

        subscriptionCode = await compile('Subscription');

        subscription = blockchain.openContract(
            Subscription.createFromConfig(
                subscriptionMasterMock.address,
                owner.address,
                subscriptionCode,
                
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

        expect(await subscription.getBalance()).toEqual(MIN_TON_RESERVE);
    });

    it ("check metadata", async () => {
        const subscriptionMetadata = await subscription.getSubscriptionData();

        expect(subscriptionMetadata.subscriptionMaster).toEqualAddress(subscriptionMasterMock.address);
        expect(subscriptionMetadata.owner).toEqualAddress(owner.address);
        expect(subscriptionMetadata.manager).toEqualAddress(manager.address);
        expect(subscriptionMetadata.activationFee).toEqual(ACTIVATION_FEE);
        expect(subscriptionMetadata.fee).toEqual(FEE);
        expect(subscriptionMetadata.period).toEqual(PERIOD);
        expect(subscriptionMetadata.activated).toEqual(false);
    });

    it("op::activate", async () => {
        // Under construction
    });
});
