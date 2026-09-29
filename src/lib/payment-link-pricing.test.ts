import { describe, expect, it } from "vitest";
import {
  describePromotion,
  formatMoney,
  summarisePricing,
  type PromotionSummary,
} from "./payment-link-pricing";

const percentPromo: PromotionSummary = {
  id: "promo_1",
  code: "SUMMER20",
  couponId: "cpn_1",
  percentOff: 20,
  amountOff: null,
  currency: "inr",
  duration: "once",
  active: true,
  timesRedeemed: 3,
  maxRedemptions: 10,
  expiresAt: null,
};

const amountPromo: PromotionSummary = {
  ...percentPromo,
  id: "promo_2",
  code: "FLAT500",
  percentOff: null,
  amountOff: 50000,
};

describe("formatMoney", () => {
  it("renders paise as rupees", () => {
    expect(formatMoney(120000, "inr")).toBe("₹1,200.00");
  });
});

describe("describePromotion", () => {
  it("labels a percentage promotion", () => {
    expect(describePromotion(percentPromo)).toEqual({
      code: "SUMMER20",
      discountLabel: "20% off",
      label: "SUMMER20 · 20% off",
    });
  });

  it("labels a fixed-amount promotion in its own currency", () => {
    expect(describePromotion(amountPromo).discountLabel).toBe("₹500.00 off");
  });

  it("falls back to the bare code when the coupon has no discount", () => {
    const bare = { ...percentPromo, percentOff: null, amountOff: null };
    expect(describePromotion(bare)).toEqual({
      code: "SUMMER20",
      discountLabel: "",
      label: "SUMMER20",
    });
  });

  it("returns an empty description for no promotion", () => {
    expect(describePromotion(null)).toEqual({ code: "", discountLabel: "", label: "" });
  });
});

describe("summarisePricing", () => {
  const items = [
    { unitAmount: 100000, quantity: 2, currency: "inr" },
    { unitAmount: 50000, quantity: 1, currency: "inr" },
  ];

  it("totals line items", () => {
    const result = summarisePricing({ items, promotion: null });
    expect(result.subtotal).toBe(250000);
    expect(result.discountAmount).toBe(0);
    expect(result.total).toBe(250000);
    expect(result.currency).toBe("inr");
  });

  it("applies a percentage promotion to the subtotal", () => {
    const result = summarisePricing({ items, promotion: percentPromo });
    expect(result.discountAmount).toBe(50000);
    expect(result.total).toBe(200000);
  });

  it("applies a fixed-amount promotion", () => {
    const result = summarisePricing({ items, promotion: amountPromo });
    expect(result.discountAmount).toBe(50000);
    expect(result.total).toBe(200000);
  });

  it("never discounts below zero", () => {
    const result = summarisePricing({
      items: [{ unitAmount: 10000, quantity: 1, currency: "inr" }],
      promotion: { ...amountPromo, amountOff: 50000 },
    });
    expect(result.discountAmount).toBe(10000);
    expect(result.total).toBe(0);
  });

  it("rounds percentage discounts to whole paise", () => {
    const result = summarisePricing({
      items: [{ unitAmount: 33333, quantity: 1, currency: "inr" }],
      promotion: { ...percentPromo, percentOff: 33.33 },
    });
    expect(Number.isInteger(result.discountAmount)).toBe(true);
    expect(result.discountAmount).toBe(11110);
  });

  it("applies a custom percentage promo entered on the form", () => {
    const result = summarisePricing({
      items,
      promotion: null,
      customPromo: { type: "percentage", value: 10 },
    });
    expect(result.discountAmount).toBe(25000);
    expect(result.total).toBe(225000);
    expect(result.discountLabel).toBe("10% off");
  });

  it("applies a custom fixed promo entered in rupees", () => {
    const result = summarisePricing({
      items,
      promotion: null,
      customPromo: { type: "fixed", value: 750 },
    });
    expect(result.discountAmount).toBe(75000);
    expect(result.total).toBe(175000);
    expect(result.discountLabel).toBe("₹750.00 off");
  });

  it("ignores an incomplete custom promo", () => {
    const result = summarisePricing({
      items,
      promotion: null,
      customPromo: { type: "percentage" },
    });
    expect(result.discountAmount).toBe(0);
    expect(result.total).toBe(250000);
  });

  it("handles an empty basket", () => {
    const result = summarisePricing({ items: [], promotion: percentPromo });
    expect(result.subtotal).toBe(0);
    expect(result.total).toBe(0);
    expect(result.currency).toBe("inr");
  });
});

describe("promotion availability", () => {
  it("reports remaining redemptions", () => {
    expect(describePromotion(percentPromo, { withRedemptions: true }).label).toBe(
      "SUMMER20 · 20% off · 7 left",
    );
  });

  it("omits redemptions when the promo is unlimited", () => {
    expect(
      describePromotion({ ...percentPromo, maxRedemptions: null }, { withRedemptions: true }).label,
    ).toBe("SUMMER20 · 20% off");
  });
});
