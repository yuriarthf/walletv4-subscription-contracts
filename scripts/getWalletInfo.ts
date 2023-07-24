import { toNano, Address } from 'ton-core';
import { WalletContractV4 } from 'ton';
import { SubscriptionMaster } from '../wrappers/SubscriptionMaster';
import { compile, NetworkProvider } from '@ton-community/blueprint';
import 'dotenv/config';

function bigintToUint8Array(num: bigint): Uint8Array {
    const array = new Uint8Array(32);
    let i = 0;
    while (num > 0n) {
        array[i] = Number(num % 256n);
        num = num / 256n;
        i++;
    }
    return array.reverse();
}

export async function run(provider: NetworkProvider) {
    const address = provider.sender().address!;
    const contractProvider = provider.provider(address);
    
    const publicKey = (await contractProvider.get('get_public_key', [])).stack.readBigNumber();
    const walletContract = provider.open(WalletContractV4.create({
        workchain: address.workChain,
        publicKey: Buffer.from(bigintToUint8Array(publicKey))
    }));

    console.log("Public Key: " + publicKey.toString());
    console.log("seqno: " + await walletContract.getSeqno());
    console.log("Balance: " + await walletContract.getBalance());
}