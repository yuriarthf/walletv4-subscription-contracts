import {
    Blockchain,
    SandboxContract,
    TreasuryContract
} from "@ton-community/sandbox";
import { Cell, beginCell, toNano, SendMode, Address } from "ton-core";
import { mnemonicNew, mnemonicToPrivateKey, sign, KeyPair } from "ton-crypto"
import { WalletContractV4 } from "ton";
import { Subscription } from "../wrappers/Subscription";
import "@ton-community/test-utils";
import { compile } from "@ton-community/blueprint";

interface PluginParams {
    seqno: number;
    walletId: number;
    pluginAddress: Address;
    value?: bigint,
    queryId?: bigint;
    secretKey: Buffer;
    timeout?: bigint;
}

function createWalletInstallPlugin(args: PluginParams): Cell {
    let signingMessage = beginCell()
        .storeUint(args.walletId, 32);
    if (args.seqno === 0) {
        signingMessage.storeUint(0xffff_ffff, 32);
    }
    else {
        signingMessage.storeUint(args.timeout || Math.floor(Date.now() / 1e3) + 60, 32); // Default timeout: 60 seconds
    }
    signingMessage.storeUint(args.seqno, 32);
    signingMessage.storeUint(2, 8); // Install Plugin
    signingMessage.storeInt(args.pluginAddress.workChain, 8);
    signingMessage.storeBuffer(args.pluginAddress.hash);
    signingMessage.storeCoins(args.value ?? 0);
    signingMessage.storeUint(args.queryId ?? 0, 64);
    
    const signature = sign(signingMessage.endCell().hash(), args.secretKey);
    return beginCell()
        .storeBuffer(signature)
        .storeBuilder(signingMessage)
    .endCell();
}

function createWalletRemovePlugin(args: PluginParams): Cell {
    let signingMessage = beginCell()
        .storeUint(args.walletId, 32);
    if (args.seqno === 0) {
        signingMessage.storeUint(0xffff_ffff, 32);
    }
    else {
        signingMessage.storeUint(args.timeout || Math.floor(Date.now() / 1e3) + 60, 32); // Default timeout: 60 seconds
    }
    signingMessage.storeUint(args.seqno, 32);
    signingMessage.storeUint(3, 8); // Remove Plugin
    signingMessage.storeInt(args.pluginAddress.workChain, 8);
    signingMessage.storeBuffer(args.pluginAddress.hash);
    signingMessage.storeCoins(args.value ?? 0);
    signingMessage.storeUint(args.queryId ?? 0, 64);
    
    const signature = sign(signingMessage.endCell().hash(), args.secretKey);
    return beginCell()
        .storeBuffer(signature)
        .storeBuilder(signingMessage)
    .endCell();
}

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
        const activateResult = await owner.send(Subscription.createWalletInstallPluginExtMsg({
            seqno: await owner.getSeqno(),
            walletId: owner.walletId,
            pluginAddress: subscription.address,
            activationFee: ACTIVATION_FEE,
            secretKey: ownerKeyPair.secretKey
        }));

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
        await owner.send(createWalletRemovePlugin({
            seqno: await owner.getSeqno(),
            walletId: owner.walletId,
            pluginAddress: subscription.address,
            value: toNano("0.5"),
            secretKey: ownerKeyPair.secretKey
        }));

        expect(await subscription.getIsActivated()).toBeFalsy();
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
