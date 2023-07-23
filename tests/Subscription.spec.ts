import {
    Blockchain,
    SandboxContract,
    TreasuryContract
} from "@ton-community/sandbox";
import { Cell, toNano, SendMode, Builder } from "ton-core";
import { mnemonicNew, mnemonicToPrivateKey, sign, KeyPair } from "ton-crypto"
import { WalletContractV4 } from "ton";
import { Subscription } from "../wrappers/Subscription";
import "@ton-community/test-utils";
import { compile } from "@ton-community/blueprint";

describe("Subscription", () => {
    let subscriptionMasterMock: SandboxContract<TreasuryContract>;
    let owner: SandboxContract<WalletContractV4>;
    let manager: SandboxContract<TreasuryContract>;
    let blockchain: Blockchain;
    let subscriptionCode: Cell;
    let subscription: SandboxContract<Subscription>;
    let ownerKeyPair: KeyPair;

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
        ownerKeyPair = await mnemonicToPrivateKey(mnemonic);
        owner = blockchain.openContract(WalletContractV4.create({
            workchain: WORKCHAIN_ID,
            publicKey: ownerKeyPair.publicKey
        }));

        await ownerDonator.send({
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
            toNano("0.5"),
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
        expect(subscriptionMetadata.activated).toBeFalsy();
    });

    it("op::activate", async () => {
        const feeInfo = await subscription.getFeeInfo();

        const activateSubscriptionBody = subscription.createActivateSubscriptionExtMsgBody({
            seqno: await owner.getSeqno(),
            walletId: owner.walletId,
            activationFee: feeInfo.activationFee,
        }) as Builder;

        const signature = sign(activateSubscriptionBody.endCell().hash(), ownerKeyPair.secretKey);


        const activateResult = await owner.send(
            Subscription.createWalletExtMsgBody(signature, activateSubscriptionBody)
        );

        expect(activateResult.transactions).toHaveTransaction({
            from: subscription.address,
            to: manager.address,
            success: true,
            value: ACTIVATION_FEE
        });

        expect(await subscription.getIsActivated()).toBeTruthy();
        expect(await subscription.getIsFulfilled()).toBeTruthy();
    });

    it("op::request_payment", async () => {
        const requestPaymentResult = await subscription.sendRequestPaymentInternal(
            manager.getSender(),
            toNano("0.5"),
            0n
        );

        // TODO (need to advance blockchain time)
    });

    it("op::deactivate", async () => {
        const deactivateSubscriptionBody = subscription.createDeactivateSubscriptionExtMsgBody({
            seqno: await owner.getSeqno(),
            walletId: owner.walletId,
        }) as Builder;

        const signature = sign(deactivateSubscriptionBody.endCell().hash(), ownerKeyPair.secretKey);


        await owner.send(
            Subscription.createWalletExtMsgBody(signature, deactivateSubscriptionBody)
        );

        expect(await subscription.getIsActivated()).toBeFalsy();
        expect(await subscription.getIsFulfilled()).toBeFalsy();
    });

    it("op::update_authority", async () => {
        const newManager = await blockchain.treasury("newManager");

        await subscription.sendUpdateAuthority(
            subscriptionMasterMock.getSender(),
            toNano("0.5"),
            0n,
            newManager.address
        );

        expect(await subscription.getManager()).toEqualAddress(newManager.address);

        await subscription.sendUpdateAuthority(
            subscriptionMasterMock.getSender(),
            toNano("0.5"),
            1n,
            manager.address
        );
    });
});
