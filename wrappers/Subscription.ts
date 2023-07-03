import {
    Address,
    Dictionary,
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
    init: 0x29c102d1 & 0x7fffffff
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
}