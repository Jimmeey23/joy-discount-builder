import { buildMomencePayload } from "./discount.decision";
import type { Tables } from "@/integrations/supabase/types";

const fixedDiscountRow = {
  discount_type: "fixed",
  discount_value: 500,
  membership_ids: [],
  code: "FIXED500",
  description: "Fixed value test",
  notes: null,
  usage_limit_type: "unlimited",
  usage_amount: null,
  renewal_limit_type: "unlimited",
  renewals_count: null,
  expires_at: null,
} as unknown as Tables<"discount_requests">;

const fixedPayload = buildMomencePayload(fixedDiscountRow);

type MomenceDiscountType = typeof fixedPayload.type;

const fixedAmountType: Extract<MomenceDiscountType, "value"> = "value";

// @ts-expect-error Momence rejects "fixed"; fixed-amount discounts must use "value".
const unsupportedFixedType: Extract<MomenceDiscountType, "fixed"> = "fixed";

export const momencePayloadTypeRegression = {
  fixedAmountType,
  unsupportedFixedType,
};
