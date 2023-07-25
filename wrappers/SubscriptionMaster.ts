import {
    Address,
    Dictionary,
    beginCell,
    Cell,
    Slice,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    TupleBuilder,
    toNano
} from 'ton-core';

import { sha256_sync } from "ton-crypto";

type Maybe<T> = T | null;


export type SubscriptionMasterConfig = {
    name?: string;
    description?: string;
    url?: string;
};

export type Init = {
    query_id?: bigint;
    metadata: Cell;
    manager: Address;
    subscription_fee: bigint;
    periodic_fee: bigint;
    fee_period: bigint;
    subscription_code: Cell;
}

export type Configure = {
    query_id?: bigint;
    subscription_fee: bigint;
    periodic_fee: bigint;
    fee_period: bigint;
}

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

function parseSnakeFormat(snake: Cell): string {
    let str = "";
    const snakeSlice = snake.asSlice();
    str += snakeSlice.loadStringTail();

    const snakeTail = snakeSlice.loadMaybeRef();
    if (snakeTail) {
        str += parseSnakeFormat(snakeTail);
    }

    return str;
}

function parseMetadataField(metadataDict: Dictionary<Buffer, Cell>, key: string): Maybe<string> {
    let field: string | Cell | Slice | null = metadataDict.get(sha256_sync(key)) ?? null;
    if (field) {
        field = (field as Cell).asSlice();
        const flag = field.loadUint(8);
        if (flag !== 0) throw new Error("Invalid field format");
        field = field.loadMaybeRef();
        if (!field) throw new Error("field should follow flag and follow snake format");
        field = parseSnakeFormat(field as Cell);
    }
    return field;
}

function parseMetadataCell(metadata: Cell): string | {[field: string]: Maybe<string> } {
    const metadataSlice = metadata.beginParse();
    const flag = metadataSlice.loadUint(8);

    switch (flag) {
        case 0:
            const metadataDict = metadataSlice.loadDict(
                Dictionary.Keys.Buffer(32),
                Dictionary.Values.Cell()
            );
            return {
                name: parseMetadataField(metadataDict, "name"),
                description: parseMetadataField(metadataDict, "description"),
                url: parseMetadataField(metadataDict, "url")
            }
        case 1:
            return metadataSlice.loadStringRefTail();     
    }

    // this could be changed later by a HttpException
    throw new Error("Invalid metadata format");
}

function assembleSubscriptionMasterInitData(index: bigint): Cell {
    return beginCell()
        .storeUint(index, 256)
    .endCell();
}

export function assembleSubscriptionMetadata(config: SubscriptionMasterConfig): Cell {
    if (config.url && !(config.name || config.description)) {
        return beginCell()
            .storeUint(0x01, 8)
            .storeStringRefTail(config.url)
        .endCell();
    }

    const metadata = Dictionary.empty(
        Dictionary.Keys.Buffer(32),
        Dictionary.Values.Cell()
    );

    if (config.name) {
        metadata.set(
            sha256_sync("name"),
            beginCell()
                .storeUint(0, 8) // Snake format data
                .storeRef(toSnakeFormat(config.name))
            .endCell()
        );
    }

    if (config.description) {
        metadata.set(
            sha256_sync("description"),
            beginCell()
                .storeUint(0, 8) // Snake format data
                .storeRef(toSnakeFormat(config.description))
            .endCell()
        );
    }

    if (config.url) {
        metadata.set(
            sha256_sync("url"),
            beginCell()
                .storeUint(0, 8) // Snake format data
                .storeRef(toSnakeFormat(config.url))
            .endCell()
        );
    }

    return beginCell()
        .storeUint(0, 8)
        .storeDict(metadata)
    .endCell();
}

export const Opcodes = {
    init: 0x29c102d1 & 0x7fffffff,
    subscribe: 0x5fcc3d14 & 0x7fffffff,
    subscribe_and_activate: 0x95f9ffea & 0x7fffffff,
    configure: 0x9e90e363 & 0x7fffffff,
    change_manager: 0x6780b0d9 & 0x7fffffff,
    update_subscription_authority: 0x944304c1 & 0x7fffffff
};

export class SubscriptionMaster implements Contract {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {}

    static createFromAddress(address: Address) {
        return new SubscriptionMaster(address);
    }

    static createFromConfig(index: bigint, code: Cell, workchain = 0) {
        const data = assembleSubscriptionMasterInitData(index);
        const init = { code, data };
        return new SubscriptionMaster(contractAddress(workchain, init), init);
    }

    static createSubscriptionMasterInitMsgContent(
        queryId: bigint,
        config: SubscriptionMasterConfig,
        manager: Address,
        activationFee: bigint,
        periodicFee: bigint,
        feePeriod: bigint,
        subscriptionCode: Cell
    ) {
        return {
            query_id: queryId,
            metadata: assembleSubscriptionMetadata(config),
            manager,
            subscription_fee: activationFee,
            periodic_fee: periodicFee,
            fee_period: feePeriod,
            subscription_code: subscriptionCode
        };
    }

    static formatConfiguration(
        queryId: bigint,
        activationFee: bigint,
        periodicFee: bigint,
        feePeriod: bigint
    ) {
        return {
            query_id: queryId,
            subscription_fee: activationFee,
            periodic_fee: periodicFee,
            fee_period: feePeriod
        }
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
                .storeRef(content.metadata)
                .storeAddress(content.manager)
                .storeCoins(content.subscription_fee)
                .storeCoins(content.periodic_fee)
                .storeUint(content.fee_period, 32)
                .storeRef(content.subscription_code)
            .endCell(),
        });
    }

    async sendSubscribe(provider: ContractProvider, via: Sender, value: bigint, queryId?: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.subscribe, 32)
                .storeUint(queryId ?? 0, 64)
            .endCell(),
        });
    }

    async sendSubscribeAndActivate(provider: ContractProvider, via: Sender, activationFee: bigint, queryId?: bigint, gas: bigint = toNano("0.2")) {
        await provider.internal(via, {
            value: activationFee + gas,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.subscribe_and_activate, 32)
                .storeUint(queryId ?? 0, 64)
            .endCell()
        });
    }

    async sendConfigure(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        configure: Configure
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.configure, 32)
                .storeUint(configure.query_id ?? 0, 64)
                .storeCoins(configure.subscription_fee)
                .storeCoins(configure.periodic_fee)
                .storeUint(configure.fee_period, 32)
            .endCell(),
        });
    }

    async sendChangeManager(
        provider: ContractProvider,
        via: Sender,
        value: bigint,
        newManager: Address,
        queryId?: bigint,
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.change_manager, 32)
                .storeUint(queryId ?? 0, 64)
                .storeAddress(newManager)
            .endCell(),
        });
    }

    async sendUpdateSubscriptionAuthority(provider: ContractProvider,
        via: Sender,
        value: bigint,
        owner: Address,
        queryId?: bigint,
    ) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.update_subscription_authority, 32)
                .storeUint(queryId ?? 0, 64)
                .storeAddress(owner)
            .endCell(),
        });
    }

    async getID(provider: ContractProvider): Promise<bigint> {
        const data = await provider.get("get_id", []);
        return data.stack.readBigNumber();
    }

    async getIsInit(provider: ContractProvider): Promise<boolean> {
        const data = await provider.get("is_init", []);
        return data.stack.readBoolean();
    }

    async getBalance(provider: ContractProvider): Promise<bigint> {
        const currentState = await provider.getState();
        return currentState.balance;
    }

    async getSubscriptionCodeHash(provider: ContractProvider): Promise<bigint> {
        const data = await provider.get("get_subscription_code_hash", []);
        return data.stack.readBigNumber();
    }

    async getSubscriptionCounter(provider: ContractProvider): Promise<bigint> {
        const data = await provider.get("get_subscription_counter", []);
        return data.stack.readBigNumber();
    }

    async getSubscriptionMasterData(provider: ContractProvider) {
        const data = await provider.get("get_subscription_master_data", []);
        const stack = data.stack;

        return {
            index: stack.readBigNumber(),
            metadata: stack.readCell(),
            manager: stack.readAddress(),
            subscriptionCounter: stack.readBigNumber(),
            activationFee: stack.readBigNumber(),
            periodicFee: stack.readBigNumber(),
            feePeriod: stack.readBigNumber(),
            subscriptionCode: stack.readCell()
        };
    }

    async getFeeConfig(provider: ContractProvider): Promise<{[field: string]: bigint}> {
        const data = await provider.get("get_fee_config", []);
        const stack = data.stack;

        return {
            activationFee: stack.readBigNumber(),
            periodicFee: stack.readBigNumber(),
            feePeriod: stack.readBigNumber()
        };
    }

    async getManager(provider: ContractProvider): Promise<Address> {
        const data = await provider.get("get_manager", []);
        const stack = data.stack;

        return stack.readAddress();
    }

    async getSubscriptionMetadata(provider: ContractProvider): Promise<string | {[field: string]: Maybe<string>}> {
        const data = await provider.get("get_subscription_metadata", []);
        const metadataCell = data.stack.readCell();

        return parseMetadataCell(metadataCell);
    }

    async getUserSubscription(provider: ContractProvider, user: Address): Promise<Address> {
        const input = new TupleBuilder();
        input.writeAddress(user);
        const data = await provider.get("get_user_subscription", input.build());
        return data.stack.readAddress();
    }
}
