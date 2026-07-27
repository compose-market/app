/**
 * Swig smart-account creation — entirely client-side.
 *
 * This is the Solana mirror of Thirdweb's ERC-4337 smart-account creation:
 *   EVM:  ConnectButton with accountAbstraction → Thirdweb creates the account
 *   SVM:  buildCreateSwigTransaction() → client builds the tx, api/ only signs as fee-payer
 *
 * The client:
 *   1. Fetches a blockhash from the real Solana RPC (directly, no proxy)
 *   2. Builds the create-Swig instruction with the EVM secp256k1 pubkey as authority
 *   3. Sets the facilitator (from api/) as fee-payer (gasless — like sponsorGas)
 *   4. Compiles + serializes the unsigned transaction to base64
 *   5. Sends it to api/ POST /api/svm/relay for fee-payer signing + broadcast
 *
 * The facilitator key never leaves the server. The client never sees it.
 */

import {
    createSolanaRpc,
    devnet as solanaDevnet,
    mainnet as solanaMainnet,
    createTransactionMessage,
    setTransactionMessageFeePayer,
    setTransactionMessageLifetimeUsingBlockhash,
    appendTransactionMessageInstruction,
    compileTransaction,
    getBase64EncodedWireTransaction,
    getProgramDerivedAddress,
    getAddressEncoder,
    address as solanaAddress,
    AccountRole,
    pipe,
    type Address as SolanaAddress,
    type Instruction,
} from "@solana/kit";
import {
    getCreateSwigInstruction,
    createSecp256k1AuthorityInfo,
    Actions,
    fetchNullableSwig,
    getSwigWalletAddress,
    getSignInstructions,
    getEvmPersonalSignPrefix,
    type Swig,
    type SigningFn,
} from "@swig-wallet/kit";
import type { NetworkId } from "@compose-market/sdk/chains";

/**
 * Create a Solana RPC client from a network ID + RPC URL.
 * Uses the real RPC URL from the chains config (no proxy).
 */
export function createSolanaRpcFromNetwork(network: NetworkId, rpcUrl: string) {
    if (network === "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1") { return createSolanaRpc(solanaDevnet(rpcUrl)); }
    // if (network === "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp") { return createSolanaRpc(solanaMainnet(rpcUrl)); }
    throw new Error(`Unsupported Solana network: ${network}`);
}

/**
 * Check if a Swig account already exists on-chain at the derived PDA.
 * Returns null if the account doesn't exist OR if it exists but isn't
 * a Swig account (e.g. a plain System-owned account with empty data).
 * The account is permanent once created — this is just an existence check.
 */
export async function fetchSwigAccount(
    rpc: ReturnType<typeof createSolanaRpcFromNetwork>,
    swigAddress: SolanaAddress,
): Promise<Swig | null> {
    try {
        return await fetchNullableSwig(rpc as any, swigAddress);
    } catch {
        return null;
    }
}

/**
 * Build the unsigned create-Swig transaction, serialized as base64.
 *
 * The fee-payer is the facilitator address (fetched from api/).
 * The authority is the EVM secp256k1 public key.
 * The Swig ID is derived deterministically from the EVM address.
 *
 * This transaction is NOT signed by the client — it's sent to api/
 * for fee-payer signing only. The Swig authority (EVM key) doesn't
 * need to sign the create instruction (the authority is registered
 * in the account data, not via signature).
 */
export async function buildCreateSwigTransaction(input: {
    swigId: Uint8Array;
    evmPubkey: `0x${string}`;
    feePayer: SolanaAddress;
    rpc: ReturnType<typeof createSolanaRpcFromNetwork>;
}): Promise<string> {
    const { swigId, evmPubkey, feePayer, rpc } = input;

    const createInstruction = await getCreateSwigInstruction({
        payer: feePayer,
        id: swigId,
        actions: Actions.set().all().get(),
        authorityInfo: createSecp256k1AuthorityInfo(evmPubkey),
    });

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    const transactionMessage = pipe(
        createTransactionMessage({ version: 0 }),
        (msg: any) => setTransactionMessageFeePayer(feePayer, msg),
        (msg: any) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, msg),
        (msg: any) => appendTransactionMessageInstruction(createInstruction as Instruction, msg),
    );

    const unsignedTransaction = compileTransaction(transactionMessage as any);
    return getBase64EncodedWireTransaction(unsignedTransaction);
}

const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const SPL_TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const ASSOCIATED_TOKEN_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const SPL_APPROVE_DISCRIMINATOR = 4;

async function readMintOwner(
    rpc: ReturnType<typeof createSolanaRpcFromNetwork>,
    mint: SolanaAddress,
): Promise<SolanaAddress> {
    const info = await rpc.getAccountInfo(mint, { encoding: "base64" }).send();
    const owner = info.value?.owner;
    if (owner === SPL_TOKEN_2022_PROGRAM) return solanaAddress(SPL_TOKEN_2022_PROGRAM);
    if (owner === SPL_TOKEN_PROGRAM) return solanaAddress(SPL_TOKEN_PROGRAM);
    if (owner) throw new Error(`Unsupported token program for mint ${mint}: ${owner}`);
    throw new Error(`Token mint not found: ${mint}`);
}

async function findAta(
    owner: SolanaAddress,
    mint: SolanaAddress,
    tokenProgram: SolanaAddress,
): Promise<SolanaAddress> {
    const encoder = getAddressEncoder();
    const [ata] = await getProgramDerivedAddress({
        programAddress: solanaAddress(ASSOCIATED_TOKEN_PROGRAM),
        seeds: [encoder.encode(owner), encoder.encode(tokenProgram), encoder.encode(mint)],
    });
    return ata;
}

function encodeApproveInstructionData(amount: bigint): Uint8Array {
    const data = new Uint8Array(9);
    data[0] = SPL_APPROVE_DISCRIMINATOR;
    new DataView(data.buffer).setBigUint64(1, amount, true);
    return data;
}

/**
 * Build a Swig-signed SPL `approve` transaction that delegates USDC spending
 * from the Swig wallet to the facilitator (SVM_TREASURY_SERVER_WALLET_PUBLIC).
 *
 * This is the Solana equivalent of EVM's `approve(treasury, budget)`:
 *   EVM:  smartAccount.approve(USDC, treasury, budget)
 *   SVM:  Swig signs SPL approve(facilitator, budget) on its USDC ATA
 *
 * The EVM secp256k1 key (admin wallet EOA) signs the Swig instruction via
 * `personal_sign` (invisible enclave for in-app wallets). The facilitator
 * pays the transaction fee (gasless, like sponsorGas).
 *
 * After this, api/ can `transferChecked` from the Swig's ATA using the
 * facilitator as delegate — exactly like EVM `transferFrom`.
 */
export async function buildSwigApproveTransaction(input: {
    /** The Swig config PDA (used for fetchSwigAccount — NOT the wallet PDA). */
    swigConfigAddress: SolanaAddress;
    /** The selected-network Solana userAddress. Must be the Swig wallet PDA. */
    expectedWalletAddress?: SolanaAddress | string | null;
    evmSignerAddress: string;
    usdcMint: string;
    amount: bigint;
    feePayer: SolanaAddress;
    network: NetworkId;
    rpcUrl: string;
    signMessage: (message: Uint8Array) => Promise<string>;
}): Promise<string> {
    const {
        swigConfigAddress,
        expectedWalletAddress,
        evmSignerAddress,
        usdcMint,
        amount,
        feePayer,
        network,
        rpcUrl,
        signMessage,
    } = input;

    const rpc = createSolanaRpcFromNetwork(network, rpcUrl);
    const { swigWalletAddress } = await loadSwigSigningContext({
        rpc,
        swigConfigAddress,
        expectedWalletAddress,
        evmSignerAddress,
    });

    const mint = solanaAddress(usdcMint);
    const tokenProgram = await readMintOwner(rpc, mint);
    const sourceAta = await findAta(swigWalletAddress as SolanaAddress, mint, tokenProgram);

    const approveData = encodeApproveInstructionData(amount);

    const approveInstruction = {
        programAddress: tokenProgram,
        accounts: [
            { address: sourceAta, role: AccountRole.WRITABLE },
            { address: feePayer, role: AccountRole.WRITABLE },
            { address: swigWalletAddress, role: AccountRole.READONLY_SIGNER },
        ],
        data: approveData,
    } as any;

    return buildSwigInstructionTransaction({
        swigConfigAddress,
        expectedWalletAddress,
        evmSignerAddress,
        feePayer,
        network,
        rpcUrl,
        instructions: [approveInstruction],
        signMessage,
    });
}

export async function buildSwigInstructionTransaction(input: {
    /** The Swig config PDA (used for fetchSwigAccount — NOT the wallet PDA). */
    swigConfigAddress: SolanaAddress;
    /** The selected-network Solana userAddress. Must be the Swig wallet PDA. */
    expectedWalletAddress?: SolanaAddress | string | null;
    evmSignerAddress: string;
    feePayer: SolanaAddress;
    network: NetworkId;
    rpcUrl: string;
    instructions: readonly Instruction[];
    signMessage: (message: Uint8Array) => Promise<string>;
}): Promise<string> {
    const {
        swigConfigAddress,
        expectedWalletAddress,
        evmSignerAddress,
        feePayer,
        network,
        rpcUrl,
        instructions,
        signMessage,
    } = input;

    if (instructions.length === 0) {
        throw new Error("At least one Solana instruction is required");
    }
    for (const instruction of instructions) {
        if (!instruction.accounts || !instruction.data) {
            throw new Error("Swig-wrapped Solana instructions must include explicit accounts and data");
        }
    }

    const rpc = createSolanaRpcFromNetwork(network, rpcUrl);
    const { swig, roleId } = await loadSwigSigningContext({
        rpc,
        swigConfigAddress,
        expectedWalletAddress,
        evmSignerAddress,
    });

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    const currentSlot = await rpc.getSlot().send();

    const signingFn: SigningFn = async (message: Uint8Array) => {
        const signed = await signMessage(message);
        return {
            signature: hexToBytes(signed),
            prefix: getEvmPersonalSignPrefix(message.length),
        };
    };

    const signInstructions = await getSignInstructions(
        swig,
        roleId,
        instructions as any,
        false,
        {
            payer: feePayer,
            currentSlot: BigInt(currentSlot),
            signingFn,
        } as any,
    );

    const transactionMessage = signInstructions.reduce(
        (msg: any, ix: any) => appendTransactionMessageInstruction(ix, msg),
        pipe(
            createTransactionMessage({ version: 0 }),
            (msg: any) => setTransactionMessageFeePayer(feePayer, msg),
            (msg: any) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, msg),
        ),
    );

    const unsignedTransaction = compileTransaction(transactionMessage as any);
    return getBase64EncodedWireTransaction(unsignedTransaction);
}

async function loadSwigSigningContext(input: {
    rpc: ReturnType<typeof createSolanaRpcFromNetwork>;
    swigConfigAddress: SolanaAddress;
    expectedWalletAddress?: SolanaAddress | string | null;
    evmSignerAddress: string;
}): Promise<{ swig: Swig; swigWalletAddress: SolanaAddress; roleId: number }> {
    const { rpc, swigConfigAddress, expectedWalletAddress, evmSignerAddress } = input;

    let swig: Swig | null;
    try {
        swig = await fetchNullableSwig(rpc as any, swigConfigAddress);
    } catch {
        swig = null;
    }
    if (!swig) {
        throw new Error("Swig account not initialized on-chain at the derived address");
    }

    const swigWalletAddress = await getSwigWalletAddress(swig) as SolanaAddress;
    if (expectedWalletAddress && swigWalletAddress !== expectedWalletAddress) {
        throw new Error(
            `Swig wallet mismatch for config ${swigConfigAddress}: selected Solana userAddress ${expectedWalletAddress}, fetched Swig wallet ${swigWalletAddress}, EVM signer ${evmSignerAddress}`,
        );
    }

    const roles = swig.findRolesBySecp256k1SignerAddress(evmSignerAddress);
    if (!roles || roles.length === 0) {
        const existingSigners = getSecp256k1RoleSignerAddresses(swig).join(", ") || "none";
        throw new Error(
            `No Swig role found for EVM signer ${evmSignerAddress} on config ${swigConfigAddress} / wallet ${swigWalletAddress}. Existing secp256k1 signers: ${existingSigners}`,
        );
    }

    return { swig, swigWalletAddress, roleId: roles[0].id };
}

function getSecp256k1RoleSignerAddresses(swig: Swig): string[] {
    return swig.roles
        .map((role: any) => role.authority?.secp256k1AddressString
            ?? role.authority?.signerAddressString
            ?? role.authority?.addressString
            ?? null)
        .filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
        .map((value) => value.startsWith("0x") ? value : `0x${value}`);
}

function hexToBytes(hex: string): Uint8Array {
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}
