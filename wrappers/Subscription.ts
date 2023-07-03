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
    ) {
        return {
            query_id: queryId,
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
        return await provider.get("get_subscription_data", []);
    }

    async getSubscriptionMaster(provider: ContractProvider) {
        return await provider.get("get_subscription_master", []);
    }

    async getSubscriber(provider: ContractProvider) {
        return await provider.get("get_subscriber", []);
    }

    async getFeeInfo(provider: ContractProvider) {
        return await provider.get("get_fee_info", []);
    }

    async isPaymentDue(provider: ContractProvider) {
        return await provider.get("is_payment_due", []);
    }

    async isActivated(provider: ContractProvider) {
        return await provider.get("is_activated", []);
    }
}