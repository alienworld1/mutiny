import { NearConnector } from "@hot-labs/near-connect";
export interface TxSubmission {
  hash: string;
  signer: string;
}
export type TxStatus = "confirmed" | "failed" | "pending";
export interface ChainClient {
  account(): Promise<string | null>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  view<T>(method: string, args: unknown, accountId?: string): Promise<T>;
  change(
    method: string,
    args: unknown,
    depositYocto: bigint,
  ): Promise<TxSubmission>;
  resolve(tx: TxSubmission): Promise<TxStatus>;
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object")
    throw new Error("Unexpected RPC response");
  return value as Record<string, unknown>;
}
export function transactionStatus(value: unknown): TxStatus {
  const result = record(value);
  const status = result.status;
  if (status && typeof status === "object" && "Failure" in status)
    return "failed";
  if (result.final_execution_status !== "FINAL") return "pending";
  return status && typeof status === "object" && "SuccessValue" in status
    ? "confirmed"
    : "pending";
}
export function createChainClient(contractId: string): ChainClient {
  if (!contractId.endsWith(".testnet"))
    throw new Error("Use a named testnet contract");
  const connector = new NearConnector({
    network: "testnet",
    autoConnect: false,
    features: { testnet: true, signAndSendTransaction: true },
  });
  async function rpc(method: string, params: unknown): Promise<unknown> {
    const response = await fetch("https://test.rpc.fastnear.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "mutiny",
        method,
        params,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error("Testnet is unavailable. Check again.");
    const body = record(await response.json());
    if (body.error)
      throw new Error("Testnet could not confirm this request. Check again.");
    return body.result;
  }
  async function account() {
    try {
      const wallet = await connector.wallet();
      return (
        (await wallet.getAccounts({ network: "testnet" }))[0]?.accountId ?? null
      );
    } catch {
      return null;
    }
  }
  return {
    account,
    async connect() {
      await connector.connect();
    },
    async disconnect() {
      await connector.disconnect();
    },
    async view<T>(
      method: string,
      args: unknown,
      accountId = contractId,
    ): Promise<T> {
      const bytes = new TextEncoder().encode(JSON.stringify(args));
      const result = record(
        await rpc("query", {
          request_type: "call_function",
          finality: "final",
          account_id: accountId,
          method_name: method,
          args_base64: btoa(String.fromCharCode(...bytes)),
        }),
      );
      if (
        !Array.isArray(result.result) ||
        !result.result.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
      )
        throw new Error("Invalid contract response");
      return JSON.parse(
        new TextDecoder().decode(new Uint8Array(result.result)),
      ) as T;
    },
    async change(method, args, depositYocto) {
      if (
        ![
          "smoke",
          "open_owned_job",
          "settle",
          "expire",
          "retry_storage_refund",
          "hire_and_open",
          "set_offer",
          "withdraw_offer",
          "request_claim",
          "reconcile_claim",
          "reconcile_payment",
          "cancel_pending_hire",
          "retry_credit_return",
        ].includes(method)
      )
        throw new Error("This action is unavailable");
      if (
        depositYocto < 0n ||
        (!["open_owned_job", "hire_and_open"].includes(method) &&
          depositYocto !== 0n)
      )
        throw new Error("Unexpected deposit");
      if (connector.network !== "testnet") throw new Error("Switch to testnet");
      const signer = await account();
      if (!signer) throw new Error("Connect a testnet wallet");
      const wallet = await connector.wallet();
      const outcome = await wallet.signAndSendTransaction({
        network: "testnet",
        signerId: signer,
        receiverId: contractId,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: method,
              args,
              gas: "200000000000000",
              deposit: depositYocto.toString(),
            },
          },
        ],
      });
      const transaction = record(record(outcome).transaction);
      if (typeof transaction.hash !== "string")
        throw new Error(
          "No transaction hash returned. Inspect your wallet before retrying.",
        );
      return { hash: transaction.hash, signer };
    },
    async resolve(tx) {
      return transactionStatus(
        await rpc("tx", {
          tx_hash: tx.hash,
          sender_account_id: tx.signer,
          wait_until: "FINAL",
        }),
      );
    },
  };
}
