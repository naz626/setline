import { describe, expect, it } from "vitest";
import { checkoutParams, taxEnabled } from "./stripe";

const input = { priceId: "price_1", customerEmail: "a@b.test", successUrl: "https://x.test/ok", cancelUrl: "https://x.test/no", workspaceId: "ws_1", plan: "starter" as const };

describe("checkout sessions and sales tax", () => {
  it("leaves tax off unless STRIPE_TAX_ENABLED is true", () => {
    expect(taxEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    const params = checkoutParams(input, {} as NodeJS.ProcessEnv);
    expect(params).not.toHaveProperty("automatic_tax");
    expect(params).not.toHaveProperty("billing_address_collection");
  });

  it("turns on automatic tax, collects the address, and allows a tax ID", () => {
    const env = { STRIPE_TAX_ENABLED: "true" } as unknown as NodeJS.ProcessEnv;
    expect(checkoutParams(input, env)).toMatchObject({
      automatic_tax: { enabled: true },
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      customer_email: "a@b.test",
    });
  });

  it("lets an existing customer's address update, and does not send the email", () => {
    const env = { STRIPE_TAX_ENABLED: "true" } as unknown as NodeJS.ProcessEnv;
    expect(checkoutParams({ ...input, customerId: "cus_1" }, env)).toMatchObject({
      customer: "cus_1",
      customer_email: undefined,
      customer_update: { address: "auto", name: "auto" },
    });
  });
});
