import assert from "node:assert/strict";
import test from "node:test";
import { base58 } from "@scure/base";
import swigKit from "@swig-wallet/kit";
const {
    findSwigPda,
    findSwigSystemAddressPdaRaw,
    getCreateSwigInstruction,
    createSecp256k1AuthorityInfo,
    Actions,
    fetchNullableSwig,
} = swigKit;
import { sha256, hexToBytes } from "viem";
import {
    createSolanaRpc,
    devnet as solanaDevnet,
    getBase64EncodedWireTransaction,
    createKeyPairSignerFromBytes,
    createTransactionMessage,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstruction,
    compileTransaction,
    signTransactionMessageWithSigners,
} from "@solana/kit";

const SOLANA_DEVNET_RPC = process.env.SOLANA_DEVNET_RPC ?? "https://api.devnet.solana.com";
const SVM_FACILITATOR_KEY = process.env.SVM_FACILITATOR_KEY;
const LIVE_THIRDWEB_SMART_ACCOUNT = "0x3f9D348A68998a87E265E3060ECA60D5825C797B";
const LIVE_THIRDWEB_ADMIN_SIGNER = "0x45f0f65bde3ca4a55d3894456683eea914c84177";
const LIVE_SOLANA_SWIG_CONFIG = "ANLr6FECdW48ZKLUB2UsZcK5XHVqmUNMLgNsjPU4g4BH";
const LIVE_SOLANA_WALLET = "BniJcwdcj2hXHmajEAbvdJLVCP8Ga2NT84kkyPR4RFPT";

function deriveSwigId(evmAddress: string): Uint8Array {
    const normalized = evmAddress.toLowerCase();
    const hashHex = sha256(new TextEncoder().encode(`compose.market:${normalized}`));
    return hexToBytes(hashHex);
}

test("deriveSwigId is deterministic — same EVM address always produces the same Swig PDA", async () => {
    const evmAddress = "0x" + "a".repeat(40);
    const swigId1 = deriveSwigId(evmAddress);
    const swigId2 = deriveSwigId(evmAddress);
    assert.deepEqual(swigId1, swigId2, "Swig ID must be identical for the same EVM address");

    const pda1 = await findSwigPda(swigId1);
    const pda2 = await findSwigPda(swigId2);
    assert.equal(pda1, pda2, "Swig PDA must be identical for the same EVM address");
});

test("deriveSwigId is unique — different EVM addresses produce different Swig PDAs", async () => {
    const addr1 = "0x" + "a".repeat(40);
    const addr2 = "0x" + "b".repeat(40);
    const pda1 = await findSwigPda(deriveSwigId(addr1));
    const pda2 = await findSwigPda(deriveSwigId(addr2));
    assert.notEqual(pda1, pda2, "Different EVM addresses must produce different Swig PDAs");
});

test("deriveSwigId is case-insensitive — EVM addresses are lowercase-normalized", async () => {
    const upper = "0x" + "A".repeat(40);
    const lower = "0x" + "a".repeat(40);
    const pdaUpper = await findSwigPda(deriveSwigId(upper));
    const pdaLower = await findSwigPda(deriveSwigId(lower));
    assert.equal(pdaUpper, pdaLower, "Upper and lowercase EVM addresses must map to the same Swig PDA");
});

test("live Thirdweb smart account maps to SVM through its admin signer", async () => {
    const adminConfig = await findSwigPda(deriveSwigId(LIVE_THIRDWEB_ADMIN_SIGNER));
    const [adminWallet] = await findSwigSystemAddressPdaRaw(adminConfig);

    assert.equal(adminConfig, LIVE_SOLANA_SWIG_CONFIG);
    assert.equal(adminWallet.toBase58(), LIVE_SOLANA_WALLET);

    const smartAccountConfig = await findSwigPda(deriveSwigId(LIVE_THIRDWEB_SMART_ACCOUNT));
    const [smartAccountWallet] = await findSwigSystemAddressPdaRaw(smartAccountConfig);

    assert.notEqual(
        smartAccountWallet.toBase58(),
        LIVE_SOLANA_WALLET,
        "Seeding Swig from the visible EVM smart-account contract would strand the existing funded SVM wallet",
    );
});

test("Swig round-trip: derive → create → fetchSwig confirms account on devnet", async (t) => {
    if (!SVM_FACILITATOR_KEY) {
        t.skip("SVM_FACILITATOR_KEY not set — skipping devnet round-trip");
        return;
    }

    const signer = await createKeyPairSignerFromBytes(base58.decode(SVM_FACILITATOR_KEY));
    const feePayer = signer.address;
    const rpc = createSolanaRpc(solanaDevnet(SOLANA_DEVNET_RPC));

    const evmAddress = "0x" + Math.random().toString(16).slice(2).padStart(40, "0");
    const swigId = deriveSwigId(evmAddress);
    const swigAddress = await findSwigPda(swigId);

    const existing = await fetchNullableSwig(rpc as any, swigAddress);
    if (existing) {
        t.skip("Swig account already exists for this random address — skipping");
        return;
    }

    const evmPubkey = "0x041b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f70beaf8f588b541507fed6a642c5ab42dfdf8120a7f639de5122d47a69a8e8d1";

    const createInstruction = await getCreateSwigInstruction({
        payer: feePayer,
        id: swigId,
        actions: Actions.set().all().get(),
        authorityInfo: createSecp256k1AuthorityInfo(evmPubkey),
    });

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    const transactionMessage = pipe(
        createTransactionMessage({ version: 0 }),
        (msg: any) => setTransactionMessageFeePayerSigner(signer, msg),
        (msg: any) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, msg),
        (msg: any) => appendTransactionMessageInstruction(createInstruction as any, msg),
    );

    const signedTx = await signTransactionMessageWithSigners(transactionMessage as any);
    const wireTx = getBase64EncodedWireTransaction(signedTx);

    const signature = await rpc.sendTransaction(wireTx, {
        encoding: "base64",
        preflightCommitment: "confirmed",
    }).send();

    for (let attempt = 0; attempt < 30; attempt++) {
        const status = await rpc.getSignatureStatuses([signature as any], {
            searchTransactionHistory: true,
        }).send();
        const current = status.value[0];
        if (current?.err) throw new Error(`Transaction failed: ${JSON.stringify(current.err)}`);
        if (current?.confirmationStatus === "confirmed" || current?.confirmationStatus === "finalized") {
            break;
        }
        await new Promise((r) => setTimeout(r, 1000));
    }

    const created = await fetchNullableSwig(rpc as any, swigAddress);
    assert.ok(created, "Swig account must exist on-chain after creation");
});

function pipe<T>(value: T, ...fns: Array<(v: T) => T>): T {
    return fns.reduce((v, fn) => fn(v), value);
}
