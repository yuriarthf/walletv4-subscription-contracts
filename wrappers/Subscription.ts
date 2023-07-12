import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
} from 'ton-core';

function assembleSubscriptionInitData(subscritionMaster: Address, index: bigint): Cell {
    return beginCell()
        .storeAddress(subscritionMaster)
        .storeUint(index, 64)
    .endCell();
}

export type Init = {
    query_id?: bigint;
    owner: Address;
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
        index: bigint,
        code: Cell,
        workchain = 0
    ) {
        const data = assembleSubscriptionInitData(subscritionMaster, index);
        const init = { code, data };
        return new Subscription(contractAddress(workchain, init), init);
    }

    static createSubscriptionInitMsgContent(
        queryId: bigint,
        owner: Address,
        manager: Address,
        activationFee: bigint,
        fee: bigint,
        period: bigint,
    ): Init {
        return {
            query_id: queryId,
            owner,
            manager,
            activation_fee: activationFee,
            fee,
            period,
        };
    }

    static createActivateSubscriptionExternalMsgContent(
        queryId: bigint,
        value: bigint,
        signature: bigint,
        subwalletId: bigint,
        validUntil: bigint,
        msgSeqNo: bigint,
        subscriptionAddress: Address
    ): Cell {
        return beginCell()
            .storeUint(signature, 512)
            .storeUint(subwalletId, 32)
            .storeUint(validUntil, 32)
            .storeUint(msgSeqNo, 32)
            .storeUint(2, 32)
            .storeUint(subscriptionAddress.workChain, 8)
            .storeBuffer(subscriptionAddress.hash, 32)
            .storeCoins(value)
            .storeUint(queryId, 64)
        .endCell();
    }

    static createDeactivateSubscriptionExternalMsgContent(
        queryId: bigint,
        value: bigint,
        signature: bigint,
        subwalletId: bigint,
        validUntil: bigint,
        msgSeqNo: bigint,
        subscriptionAddress: Address
    ): Cell {
        return beginCell()
            .storeUint(signature, 512)
            .storeUint(subwalletId, 32)
            .storeUint(validUntil, 32)
            .storeUint(msgSeqNo, 32)
            .storeUint(2, 32)
            .storeUint(subscriptionAddress.workChain, 8)
            .storeBuffer(subscriptionAddress.hash, 32)
            .storeCoins(value)
            .storeUint(queryId, 64)
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
                .storeAddress(content.owner)
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
            index: stack.readBigNumber(),
            owner: stack.readAddress(),
            manager: stack.readAddress(),
            activationFee: stack.readBigNumber(),
            fee: stack.readBigNumber(),
            period: stack.readBigNumber(),
            lastPaid: stack.readBigNumber(),
            activated: stack.readBoolean()
        }
    }

    async getID(provider: ContractProvider): Promise<bigint> {
        const data = await provider.get("get_id", []);
        return data.stack.readBigNumber();
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