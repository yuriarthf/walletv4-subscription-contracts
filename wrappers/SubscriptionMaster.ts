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

import { sha256_sync } from "ton-crypto";


export type SubscriptionMasterConfig = {
    metadata: {
        name?: string;
        description?: string;
    };
};

function toSnakeFormat(str: string): Cell {
    const snakeCell = beginCell();
    if (str.length > 127) { // 127 bytes = 1016 bits (< 1023)
        snakeCell.storeStringTail(str.slice(0, 127));
        snakeCell.storeRef(toSnakeFormat(str.slice(127)));
    } else {
        snakeCell.storeStringTail(str);
    }

    return snakeCell.endCell();
}

export function subscriptionMasterConfigToCell(config: SubscriptionMasterConfig): Cell {
    const metadata = Dictionary.empty(
        Dictionary.Keys.Buffer(32),
        Dictionary.Values.Cell()
    );

    if (config.metadata.name) {
        metadata.set(
            sha256_sync("name"),
            beginCell()
                .storeUint(0, 8) // Snake format data
                .storeRef(toSnakeFormat(config.metadata.name))
            .endCell()
        );
    }

    if (config.metadata.description) {
        metadata.set(
            sha256_sync("description"),
            beginCell()
                .storeUint(0, 8) // Snake format data
                .storeRef(toSnakeFormat(config.metadata.description))
            .endCell()
        );
    }

    return beginCell()
        .storeRef(beginCell()
            .storeUint(0, 8)
            .storeDict(metadata)
        .endCell())
    .endCell();
}

export const Opcodes = {
    subscribe: 0x5fcc3d14 & 0x7fffffff,
    configure: 0x9e90e363 & 0x7fffffff,
    change_manager: 0x6780b0d9 & 0x7fffffff,
    update_subscription_authority: 0x944304c1 & 0x7fffffff
};

export class SubscriptionMaster implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new SubscriptionMaster(address);
    }

    static createFromConfig(config: SubscriptionMasterConfig, code: Cell, workchain = 0) {
        const data = subscriptionMasterConfigToCell(config);
        const init = { code, data };
        return new SubscriptionMaster(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendIncrease(
        provider: ContractProvider,
        via: Sender,
        opts: {
            increaseBy: number;
            value: bigint;
            queryID?: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.increase, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeUint(opts.increaseBy, 32)
                .endCell(),
        });
    }

    async getCounter(provider: ContractProvider) {
        const result = await provider.get('get_counter', []);
        return result.stack.readNumber();
    }

    async getID(provider: ContractProvider) {
        const result = await provider.get('get_id', []);
        return result.stack.readNumber();
    }
}
