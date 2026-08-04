import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AccountRole,
  appendTransactionMessageInstruction,
  compileTransaction,
  createTransactionMessage,
  getCompiledTransactionMessageDecoder,
  getInstructionsFromCompiledTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
} from "@solana/kit";

const sessionSource = readFileSync(new URL("../src/hooks/use-session.tsx", import.meta.url), "utf8");
const connectorSource = readFileSync(new URL("../src/components/connector.tsx", import.meta.url), "utf8");
const networkSelectorSource = readFileSync(new URL("../src/components/network-selector.tsx", import.meta.url), "utf8");
const balancesSource = readFileSync(new URL("../src/hooks/use-multichain.ts", import.meta.url), "utf8");
const svmHookSource = readFileSync(new URL("../src/hooks/use-svm.ts", import.meta.url), "utf8");
const svmSwigSource = readFileSync(new URL("../src/lib/svm/swig.ts", import.meta.url), "utf8");
const playgroundSource = readFileSync(new URL("../src/pages/playground.tsx", import.meta.url), "utf8");
const agentSource = readFileSync(new URL("../src/pages/agent.tsx", import.meta.url), "utf8");
const workflowSource = readFileSync(new URL("../src/pages/workflow.tsx", import.meta.url), "utf8");
const connectLocalSource = readFileSync(new URL("../src/pages/connect-local.tsx", import.meta.url), "utf8");

test("session provider attaches and subscribes with the selected-network userAddress", () => {
  assert.match(sessionSource, /useSelectedUserAddress/);
  assert.match(sessionSource, /sdk\.wallets\.attach\(\{\s*address:\s*userAddress,\s*network:\s*paymentNetwork/s);
  assert.match(sessionSource, /sdk\.session\.subscribe\(\{\s*userAddress,\s*network/s);
  assert.doesNotMatch(sessionSource, /solanaAddress\s*\?\?\s*account\.address/);
  assert.doesNotMatch(sessionSource, /userAddress:\s*account\.address/);
});

test("billable page call sites use the selected-network userAddress", () => {
  for (const [name, source] of [
    ["playground", playgroundSource],
    ["agent", agentSource],
    ["workflow", workflowSource],
    ["connect-local", connectLocalSource],
  ] as const) {
    assert.match(source, /useSelectedUserAddress/, `${name} should read selected-network userAddress`);
    assert.doesNotMatch(source, /userAddress:\s*account\.address/, `${name} must not hard-code the EVM account`);
    assert.doesNotMatch(source, /wallet\.getAccount\(\)\?\.address\s*\?\?\s*account\.address/, `${name} must not fall back to the EVM account`);
  }
});

test("network selector and connector balance queries include EVM and Solana accounts", () => {
  assert.match(balancesSource, /evmAddress/);
  assert.match(balancesSource, /solanaAddress/);
  assert.match(networkSelectorSource, /useSelectedUserAddress/);
  assert.match(networkSelectorSource, /evmAddress/);
  assert.match(networkSelectorSource, /solanaAddress/);
  assert.match(connectorSource, /useSelectedUserAddress/);
  assert.match(connectorSource, /useTotalBalance\(\{[\s\S]*?evmAddress:[\s\S]*?solanaAddress:[\s\S]*?\}\s*,/s);
});

test("connector connects through an EVM smart account chain even when Solana is selected", () => {
  assert.match(connectorSource, /thirdwebNetwork/);
  assert.match(connectorSource, /connectChain/);
  assert.match(connectorSource, /chain=\{connectChain\}/);
  assert.match(connectorSource, /accountAbstraction=\{dynamicAccountAbstraction\}/);
});

test("old Solana wallet shortcuts do not return", () => {
  const allSources = [
    sessionSource,
    connectorSource,
    networkSelectorSource,
    balancesSource,
    playgroundSource,
    agentSource,
    workflowSource,
    connectLocalSource,
  ].join("\n");

  assert.doesNotMatch(allSources, /https:\/\/api\.thirdweb\.com\/v1\/solana\/wallets/);
  assert.doesNotMatch(allSources, /compose_solana_address/);
});

test("SVM resolver is selected-network aware and does not loop create checks", () => {
  assert.match(svmHookSource, /paymentNetwork/);
  assert.match(svmHookSource, /selectedSolanaChain/);
  assert.match(svmHookSource, /creatingRef/);
  assert.match(svmHookSource, /checkedKeyRef/);
  assert.doesNotMatch(svmHookSource, /solanaChains\[0\]/);
  assert.doesNotMatch(svmHookSource, /isCreating\]/);
});

test("SVM approve builder emits a plain SPL approve without impossible ATA signer", () => {
  assert.match(svmSwigSource, /AccountRole/);
  assert.match(svmSwigSource, /new Uint8Array\(9\)/);
  assert.match(svmSwigSource, /data\[0\]\s*=\s*SPL_APPROVE_DISCRIMINATOR/);
  assert.doesNotMatch(svmSwigSource, /data\[9\]\s*=/);
  assert.doesNotMatch(svmSwigSource, /encodeApproveInstructionData\(amount,\s*decimals\)/);
  assert.match(svmSwigSource, /\{\s*address:\s*sourceAta,\s*role:\s*AccountRole\.WRITABLE\s*\}/);
  assert.match(svmSwigSource, /\{\s*address:\s*feePayer,\s*role:\s*AccountRole\.WRITABLE\s*\}/);
  assert.match(svmSwigSource, /\{\s*address:\s*swigWalletAddress,\s*role:\s*AccountRole\.READONLY_SIGNER\s*\}/);
  assert.doesNotMatch(svmSwigSource, /\{\s*address:\s*sourceAta,\s*role:\s*3\s*\}/);
  assert.doesNotMatch(svmSwigSource, /AccountRole\.WRITABLE_SIGNER/);
});

test("SVM approve builder signs the fee payer with the same role Solana runtime exposes", () => {
  assert.equal(swigSignedPayerRole(AccountRole.READONLY), AccountRole.READONLY_SIGNER);
  assert.equal(compileRuntimePayerRole(AccountRole.READONLY_SIGNER), AccountRole.WRITABLE_SIGNER);

  assert.equal(swigSignedPayerRole(AccountRole.WRITABLE), AccountRole.WRITABLE_SIGNER);
  assert.equal(compileRuntimePayerRole(AccountRole.WRITABLE_SIGNER), AccountRole.WRITABLE_SIGNER);
});

test("SVM approve builder guards the internal config PDA against the selected Solana userAddress", () => {
  assert.match(svmSwigSource, /expectedWalletAddress/);
  assert.match(svmSwigSource, /Swig wallet mismatch for config/);
  assert.match(sessionSource, /expectedWalletAddress:\s*solanaAddress/);
  assert.match(svmSwigSource, /Existing secp256k1 signers/);
});

const FEE_PAYER = "139ckThCRxYDDFXgfRjH4TCiaTJETbb1UMLwACvWJ1fq" as Address;
const SWIG_WALLET = "BniJcwdcj2hXHmajEAbvdJLVCP8Ga2NT84kkyPR4RFPT" as Address;
const SWIG_PROGRAM = "swigypWHEksbC64pWKwah1WTeh9JXwx8H1rJHLdbQMB" as Address;
const STATIC_BLOCKHASH = {
  blockhash: "11111111111111111111111111111111" as Blockhash,
  lastValidBlockHeight: 1n,
};

function swigSignedPayerRole(innerDelegateRole: AccountRole): AccountRole {
  return innerDelegateRole === AccountRole.WRITABLE
    ? AccountRole.WRITABLE_SIGNER
    : AccountRole.READONLY_SIGNER;
}

function compileRuntimePayerRole(swigInstructionPayerRole: AccountRole): AccountRole | undefined {
  const transaction = compileTransaction(
    appendTransactionMessageInstruction(
      {
        programAddress: SWIG_PROGRAM,
        accounts: [
          { address: SWIG_WALLET, role: AccountRole.WRITABLE },
          { address: FEE_PAYER, role: swigInstructionPayerRole },
        ],
        data: new Uint8Array(),
      },
      setTransactionMessageLifetimeUsingBlockhash(
        STATIC_BLOCKHASH,
        setTransactionMessageFeePayer(FEE_PAYER, createTransactionMessage({ version: 0 })),
      ),
    ),
  );

  const decoded = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  const [runtimeInstruction] = getInstructionsFromCompiledTransactionMessage(decoded);
  return runtimeInstruction?.accounts?.find((account) => account.address === FEE_PAYER)?.role;
}
