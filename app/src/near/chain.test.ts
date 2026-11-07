import { describe, expect, it } from "vitest";
import { transactionStatus } from "./chain";
describe("wallet confirmation boundary", () => {
  it("keeps a submitted transaction pending", () =>
    expect(
      transactionStatus({
        final_execution_status: "INCLUDED",
        status: { SuccessReceiptId: "receipt" },
      }),
    ).toBe("pending"));
  it("only confirms a final successful execution", () =>
    expect(
      transactionStatus({
        final_execution_status: "FINAL",
        status: { SuccessValue: "MQ==" },
      }),
    ).toBe("confirmed"));
  it("recognizes execution failure", () =>
    expect(
      transactionStatus({
        final_execution_status: "FINAL",
        status: { Failure: {} },
      }),
    ).toBe("failed"));
});
