import { sign } from 'ton-crypto';
import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    toNano
} from 'ton-core';

interface InstallPluginParams {
    seqno: number;
    walletId: number;
    pluginAddress: Address;
    activationFee: bigint,
    gas?: bigint, 
    queryId?: bigint;
    secretKey: Buffer;
    timeout?: bigint;
}

interface RemovePluginParams {
    seqno: number;
    walletId: number;
    pluginAddress: Address;
    gas?: bigint,
    queryId?: bigint;
    secretKey: Buffer;
    timeout?: bigint;
}

function assembleSubscriptionInitData(subscritionMaster: Address, owner: Address): Cell {
    return beginCell()
        .storeAddress(subscritionMaster)
        .storeAddress(owner)
    .endCell();
}

export type Init = {
    query_id?: bigint;
    manager: Address;
    activation_fee: bigint;
    fee: bigint;
    period: bigint;
}

export const Opcodes = {
    init: 0x29c102d1 & 0x7fffffff,
    request_payment: 0xa5d92f79 & 0x7fffffff,
    update_authority: 0x49697bd2 & 0x7fffffff
};

export class Subscription implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new Subscription(address);
    }

    static createFromConfig(
        subscritionMaster: Address,
        owner: Address,
        code: Cell,
        workchain = 0
    ) {
        const data = assembleSubscriptionInitData(subscritionMaster, owner);
        const init = { code, data };
        return new Subscription(contractAddress(workchain, init), init);
    }

    static createSubscriptionInitMsgContent(
        queryId: bigint,
        manager: Address,
        activationFee: bigint,
        fee: bigint,
        period: bigint,
    ): Init {
        return {
            query_id: queryId,
            manager,
            activation_fee: activationFee,
            fee,
            period,
        };
    }

    static createWalletInstallPluginExtMsg(args: InstallPluginParams): Cell {
        // Default gas to 0.1 ton
        args.gas ?? (args.gas = toNano('0.1'));

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
        signingMessage.storeCoins(args.activationFee + args.gas);
        signingMessage.storeUint(args.queryId ?? 0, 64);
        
        const signature = sign(signingMessage.endCell().hash(), args.secretKey);
        return beginCell()
            .storeBuffer(signature)
            .storeBuilder(signingMessage)
        .endCell();
    }

    static createWalletRemovePluginExtMsg(args: RemovePluginParams): Cell {
        // Default gas to 0.1 ton
        args.gas ?? (args.gas = toNano('0.1'));

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
        signingMessage.storeCoins(args.gas ?? 0);
        signingMessage.storeUint(args.queryId ?? 0, 64);
        
        const signature = sign(signingMessage.endCell().hash(), args.secretKey);
        return beginCell()
            .storeBuffer(signature)
            .storeBuilder(signingMessage)
        .endCell();
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint, init?: Init) {
        if (init) {
            await this.sendInit(provider, via, value, init);
            return;
        }
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendInit(provider: ContractProvider, via: Sender, value: bigint, content: Init) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.init, 32)
                .storeUint(content.query_id ?? 0, 64)
                .storeAddress(via.address)
                .storeAddress(content.manager)
                .storeCoins(content.activation_fee)
                .storeCoins(content.fee)
                .storeUint(content.period, 32)
            .endCell(),
        });
    }

    async sendRequestPaymentExternal(provider: ContractProvider, queryId: bigint) {
        await provider.external(
            beginCell()
                .storeUint(Opcodes.request_payment, 32)
                .storeUint(queryId, 64)
            .endCell()
        )
    }

    async sendRequestPaymentInternal(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        queryId: bigint
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.request_payment, 32)
                .storeUint(queryId, 64)
            .endCell(),
        })
    }

    async sendUpdateAuthority(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        queryId: bigint,
        newManager: Address
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.update_authority, 32)
                .storeUint(queryId, 64)
                .storeAddress(newManager)
            .endCell()
        });
    }

    async getSubscriptionData(provider: ContractProvider) {
        const data = await provider.get("get_subscription_data", []);
        const stack = data.stack;
        
        return {
            subscriptionMaster: stack.readAddress(),
            owner: stack.readAddress(),
            manager: stack.readAddress(),
            activationFee: stack.readBigNumber(),
            fee: stack.readBigNumber(),
            period: stack.readBigNumber(),
            lastPaid: stack.readBigNumber(),
            activated: stack.readBoolean()
        }
    }

    async getIsInit(provider: ContractProvider): Promise<boolean> {
        const data = await provider.get("is_init", []);
        return data.stack.readBoolean();
    }

    async getBalance(provider: ContractProvider) {
        const currentState = await provider.getState();
        return currentState.balance;
    }

    async getSubscriptionMaster(provider: ContractProvider): Promise<Address> {
        const data = await provider.get("get_subscription_master", []);
        return data.stack.readAddress();
    }

    async getSubscriber(provider: ContractProvider): Promise<Address> {
        const data = await provider.get("get_subscriber", []);
        return data.stack.readAddress();
    }

    async getFeeInfo(provider: ContractProvider): Promise<{[field: string]: bigint}> {
        const data = await provider.get("get_fee_info", []);
        const stack = data.stack;
        return {
            activationFee: stack.readBigNumber(),
            fee: stack.readBigNumber(),
            lastPaid: stack.readBigNumber(),
            period: stack.readBigNumber()
        }
    }

    async getManager(provider: ContractProvider): Promise<Address> {
        const data = await provider.get("get_manager", []);
        return data.stack.readAddress();
    }

    async getIsPaymentDue(provider: ContractProvider): Promise<boolean> {
        const data = await provider.get("is_payment_due", []);
        return data.stack.readBoolean();
    }

    async getIsActivated(provider: ContractProvider): Promise<boolean> {
        const data = await provider.get("is_activated", []);
        return data.stack.readBoolean();
    }

    async getIsFulfilled(provider: ContractProvider): Promise<boolean> {
        const data = await provider.get("is_fulfilled", []);
        return data.stack.readBoolean();
    }
}