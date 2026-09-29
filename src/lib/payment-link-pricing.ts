/**
 * Pure pricing helpers shared by the payment link form, the approval email, and
 * the requests list. No Stripe or Supabase access here on purpose: everything in
 * this module is a plain function over plain data so it can be unit tested.
 *
 * All monetary amounts are in the currency's smallest unit (paise for INR),
 * matching Stripe. Custom promo values are the exception: they are entered by a
 * human in major units (rupees / percent) and converted here.
 */

export type PromotionSummary = {
  id: string;
  code: string;
  couponId: string;
  percentOff: number | null;
  amountOff: number | null;
  currency: string | null;
  duration: string | null;
  active: boolean;
  timesRedeemed: number;
  maxRedemptions: number | null;
  expiresAt: number | null;
};

export type CustomPromo = {
  type: "percentage" | "fixed" | null;
  value?: number | null;
};

export type PricingItem = {
  unitAmount: number;
  quantity: number;
  currency: string;
};

export type PricingSummary = {
  currency: string;
  subtotal: number;
  discountAmount: number;
  total: number;
  discountLabel: string;
};

const DEFAULT_CURRENCY = "inr";

export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: (currency || DEFAULT_CURRENCY).toUpperCase(),
  }).format(amount / 100);
}

/**
 * Human-readable description of a Stripe promotion code. `discountLabel` is the
 * bare discount ("20% off") so callers can place it in a table cell of its own;
 * `label` is the dropdown/summary form.
 */
export function describePromotion(
  promotion: PromotionSummary | null | undefined,
  options: { withRedemptions?: boolean } = {},
) {
  if (!promotion) return { code: "", discountLabel: "", label: "" };

  const discountLabel = promotion.percentOff
    ? `${promotion.percentOff}% off`
    : promotion.amountOff
      ? `${formatMoney(promotion.amountOff, promotion.currency ?? DEFAULT_CURRENCY)} off`
      : "";

  const parts = [promotion.code, discountLabel];
  if (options.withRedemptions && promotion.maxRedemptions != null) {
    parts.push(`${Math.max(promotion.maxRedemptions - promotion.timesRedeemed, 0)} left`);
  }

  return {
    code: promotion.code,
    discountLabel,
    label: parts.filter(Boolean).join(" · "),
  };
}

function customPromoDiscount(subtotal: number, currency: string, custom?: CustomPromo | null) {
  if (!custom?.type || !custom.value || custom.value <= 0) return null;
  if (custom.type === "percentage") {
    return {
      amount: Math.round((subtotal * custom.value) / 100),
      label: `${custom.value}% off`,
    };
  }
  const amount = Math.round(custom.value * 100);
  return { amount, label: `${formatMoney(amount, currency)} off` };
}

/**
 * Totals a basket and applies at most one discount: an existing Stripe
 * promotion code if given, otherwise a custom promo typed into the form.
 */
export function summarisePricing(input: {
  items: PricingItem[];
  promotion: PromotionSummary | null | undefined;
  customPromo?: CustomPromo | null;
}): PricingSummary {
  const currency = input.items[0]?.currency || DEFAULT_CURRENCY;
  const subtotal = input.items.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0);

  const fromPromotion = input.promotion
    ? {
        amount: input.promotion.percentOff
          ? Math.round((subtotal * input.promotion.percentOff) / 100)
          : (input.promotion.amountOff ?? 0),
        label: describePromotion(input.promotion).discountLabel,
      }
    : null;

  const discount = fromPromotion ?? customPromoDiscount(subtotal, currency, input.customPromo);
  const discountAmount = Math.min(discount?.amount ?? 0, subtotal);

  return {
    currency,
    subtotal,
    discountAmount,
    total: subtotal - discountAmount,
    discountLabel: discountAmount > 0 ? (discount?.label ?? "") : "",
  };
}
