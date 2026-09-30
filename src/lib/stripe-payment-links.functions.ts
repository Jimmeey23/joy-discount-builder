import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json, Tables } from "@/integrations/supabase/types";
import {
  describePromotion,
  summarisePricing,
  type PricingItem,
  type PromotionSummary,
} from "@/lib/payment-link-pricing";
import type Stripe from "stripe";

type PaymentLinkRow = Tables<"payment_link_requests">;
type MomenceTokenCache = {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
};

const APPROVAL_EMAIL = "jimmeey@physique57india.com";
const STABLE_PUBLIC_URL = "https://project--5d498845-315c-4003-af46-2a005cd23f71.lovable.app";
let momenceTokenCache: MomenceTokenCache | null = null;

function getBaseUrl() {
  const override = process.env.PUBLIC_APP_URL;
  if (override) return override.replace(/\/$/, "");
  return STABLE_PUBLIC_URL;
}

async function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  const { default: Stripe } = await import("stripe");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" });
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function sendMailtrap(opts: { to: string; subject: string; html: string; text: string }) {
  const token = process.env.MAILTRAP_API_TOKEN;
  const sender = process.env.MAILTRAP_SENDER_EMAIL;
  if (!token) throw new Error("MAILTRAP_API_TOKEN is not configured");
  if (!sender) throw new Error("MAILTRAP_SENDER_EMAIL is not configured");

  const res = await fetch("https://send.api.mailtrap.io/api/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: { email: sender, name: "Stripe Payment Link Approvals" },
      to: [{ email: opts.to }],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      category: "payment-link-approval",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mailtrap send failed [${res.status}]: ${body}`);
  }
  return res.json();
}

function productName(product: string | Stripe.Product | Stripe.DeletedProduct | null) {
  if (product && typeof product === "object" && !("deleted" in product)) return product.name;
  return "Stripe product";
}

function productId(product: string | Stripe.Product | Stripe.DeletedProduct | null) {
  if (typeof product === "string") return product;
  if (product && typeof product === "object" && "id" in product) return product.id;
  return null;
}

/**
 * Stripe moved the coupon on a promotion code: older API versions embed
 * `coupon`, 2026-02-25.clover nests it under `promotion.coupon`. Read whichever
 * this account's API version returns.
 */
function resolveCoupon(promotionCode: unknown): Stripe.Coupon | null {
  const record = promotionCode as {
    coupon?: unknown;
    promotion?: { coupon?: unknown } | null;
  };
  const candidate = record?.promotion?.coupon ?? record?.coupon;
  if (!candidate || typeof candidate !== "object") return null;
  if ("deleted" in candidate) return null;
  return candidate as Stripe.Coupon;
}

function isMumbaiStripePrice(price: Stripe.Price) {
  const product = price.product;
  const productObject =
    product && typeof product === "object" && !("deleted" in product) ? product : null;
  const haystack = [
    productObject?.name,
    productObject?.description,
    productObject?.metadata?.location,
    productObject?.metadata?.city,
    productObject?.metadata?.studio,
    price.nickname,
    price.metadata?.location,
    price.metadata?.city,
    price.metadata?.studio,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    haystack.includes("mumbai") ||
    haystack.includes("bandra") ||
    haystack.includes("kemps") ||
    haystack.includes("kwality") ||
    haystack.includes("courtside") ||
    haystack.includes("supreme")
  );
}

const CreatePaymentLinkSchema = z
  .object({
    lineItems: z
      .array(
        z.object({
          priceId: z.string().min(1),
          quantity: z.number().int().min(1).max(999),
        }),
      )
      .min(1)
      .max(20),
    promoMode: z.enum(["none", "existing", "custom"]),
    promotionCodeId: z.string().optional().nullable(),
    customPromoCode: z.string().trim().max(64).optional().nullable(),
    customPromoType: z.enum(["percentage", "fixed"]).optional().nullable(),
    customPromoValue: z.number().min(0.01).max(1000000).optional().nullable(),
    customerEmail: z.string().email().optional().nullable(),
    customerName: z.string().max(120).optional().nullable(),
    momenceMemberId: z.string().max(80).optional().nullable(),
    momenceMemberDetails: z.unknown().optional().nullable(),
    description: z.string().max(1000).optional().nullable(),
    customFields: z
      .array(
        z.object({
          key: z.string().trim().min(1).max(40),
          label: z.string().trim().min(1).max(50),
          type: z.enum(["text", "numeric"]),
          optional: z.boolean(),
        }),
      )
      .max(3)
      .optional(),
    utm: z
      .object({
        source: z.string().max(100).optional().nullable(),
        medium: z.string().max(100).optional().nullable(),
        campaign: z.string().max(100).optional().nullable(),
        term: z.string().max(100).optional().nullable(),
        content: z.string().max(100).optional().nullable(),
      })
      .optional(),
    purpose: z.string().max(500).optional().nullable(),
    createdBy: z.string().max(120).optional().nullable(),
    internalNote: z.string().max(1000).optional().nullable(),
    customerPhone: z.string().max(40).optional().nullable(),
    collectAddress: z.boolean().optional(),
    collectPhone: z.boolean().optional(),
    singleUse: z.boolean().optional(),
    adjustableQuantity: z.boolean().optional(),
    allowPromotionCodes: z.boolean().optional(),
    maxRedemptions: z.number().int().min(1).max(1000000).optional().nullable(),
    linkExpiresAt: z.string().datetime({ offset: true }).optional().nullable(),
    afterCompletionType: z.enum(["redirect", "message"]).optional(),
    afterCompletionMessage: z.string().max(500).optional().nullable(),
    afterCompletionRedirectUrl: z.string().url().max(500).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.afterCompletionType === "message" && !data.afterCompletionMessage?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter the confirmation message shown after payment",
        path: ["afterCompletionMessage"],
      });
    }
    if (data.linkExpiresAt && new Date(data.linkExpiresAt).getTime() <= Date.now()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Expiry must be in the future",
        path: ["linkExpiresAt"],
      });
    }
    if (data.promoMode === "existing" && !data.promotionCodeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select an existing promo code",
        path: ["promotionCodeId"],
      });
    }
    if (data.promoMode === "custom") {
      if (!data.customPromoCode?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a custom promo code",
          path: ["customPromoCode"],
        });
      }
      if (!data.customPromoType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Select custom promo type",
          path: ["customPromoType"],
        });
      }
      if (!data.customPromoValue) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter custom promo value",
          path: ["customPromoValue"],
        });
      }
      if (data.customPromoType === "percentage" && Number(data.customPromoValue) > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Percentage promo cannot exceed 100",
          path: ["customPromoValue"],
        });
      }
    }
  });

const UpdatePaymentLinkSchema = CreatePaymentLinkSchema.and(z.object({ id: z.string().uuid() }));

type PaymentLinkInput = z.infer<typeof CreatePaymentLinkSchema>;

async function buildPaymentLinkRequestPayload(
  stripe: Awaited<ReturnType<typeof stripeClient>>,
  data: PaymentLinkInput,
) {
  const prices = await Promise.all(
    data.lineItems.map((item) => stripe.prices.retrieve(item.priceId, { expand: ["product"] })),
  );
  const enrichedItems = prices.map((price, index) => ({
    priceId: price.id,
    productId: productId(price.product),
    productName: productName(price.product),
    currency: price.currency,
    unitAmount: price.unit_amount ?? 0,
    quantity: data.lineItems[index].quantity,
    amount: (price.unit_amount ?? 0) * data.lineItems[index].quantity,
  }));
  const first = enrichedItems[0];
  const total = enrichedItems.reduce((sum, item) => sum + item.amount, 0);
  const promotionSnapshot =
    data.promoMode === "existing" && data.promotionCodeId
      ? await fetchPromotionSummary(stripe, data.promotionCodeId)
      : null;

  return {
    stripe_price_id: first.priceId,
    stripe_product_id: first.productId,
    product_name:
      enrichedItems.length === 1
        ? first.productName
        : `${first.productName} + ${enrichedItems.length - 1} more`,
    line_items: toJson(enrichedItems),
    currency: first.currency,
    unit_amount: first.unitAmount,
    quantity: first.quantity,
    requested_amount: total,
    promotion_code_id: data.promoMode === "existing" ? data.promotionCodeId : null,
    promotion_code: data.promoMode === "custom" ? data.customPromoCode?.trim().toUpperCase() : null,
    custom_promo_type: data.promoMode === "custom" ? data.customPromoType : null,
    custom_promo_value: data.promoMode === "custom" ? data.customPromoValue : null,
    customer_email: data.customerEmail || null,
    customer_name: data.customerName || null,
    momence_member_id: data.momenceMemberId || null,
    momence_member_details: data.momenceMemberDetails ? toJson(data.momenceMemberDetails) : null,
    description: data.description || null,
    custom_fields: toJson(data.customFields ?? []),
    utm_parameters: toJson(data.utm ?? {}),
    purpose: data.purpose || null,
    created_by: data.createdBy || null,
    internal_note: data.internalNote || null,
    customer_phone: data.customerPhone || null,
    collect_address: data.collectAddress ?? false,
    collect_phone: data.collectPhone ?? false,
    single_use: data.singleUse ?? false,
    adjustable_quantity: data.adjustableQuantity ?? false,
    allow_promotion_codes: data.allowPromotionCodes ?? false,
    max_redemptions: data.maxRedemptions ?? null,
    link_expires_at: data.linkExpiresAt ?? null,
    after_completion_type: data.afterCompletionType ?? "redirect",
    after_completion_message: data.afterCompletionMessage || null,
    after_completion_redirect_url: data.afterCompletionRedirectUrl || null,
    promotion_code_snapshot: promotionSnapshot ? toJson(promotionSnapshot) : null,
  };
}

/**
 * Snapshot of a promotion code at request time, so the approval email and the
 * links list can show the discount without another Stripe round trip.
 */
async function fetchPromotionSummary(
  stripe: Awaited<ReturnType<typeof stripeClient>>,
  promotionCodeId: string,
): Promise<PromotionSummary | null> {
  try {
    const promo = await stripe.promotionCodes.retrieve(promotionCodeId, {
      expand: ["promotion.coupon"],
    });
    const couponObject = resolveCoupon(promo);
    return {
      id: promo.id,
      code: promo.code,
      couponId: couponObject?.id ?? "",
      percentOff: couponObject?.percent_off ?? null,
      amountOff: couponObject?.amount_off ?? null,
      currency: couponObject?.currency ?? null,
      duration: couponObject?.duration ?? null,
      active: promo.active,
      timesRedeemed: promo.times_redeemed ?? 0,
      maxRedemptions: promo.max_redemptions ?? null,
      expiresAt: promo.expires_at ?? null,
    };
  } catch {
    return null;
  }
}

/** Promotion snapshot stored on a row, or one reconstructed from a custom promo. */
export function rowPromotion(row: PaymentLinkRow): PromotionSummary | null {
  const snapshot = row.promotion_code_snapshot;
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
    return snapshot as unknown as PromotionSummary;
  }
  if (!row.promotion_code) return null;
  return {
    id: row.custom_promotion_code_id ?? row.promotion_code_id ?? "",
    code: row.promotion_code,
    couponId: row.custom_coupon_id ?? "",
    percentOff:
      row.custom_promo_type === "percentage" && row.custom_promo_value
        ? Number(row.custom_promo_value)
        : null,
    amountOff:
      row.custom_promo_type === "fixed" && row.custom_promo_value
        ? Math.round(Number(row.custom_promo_value) * 100)
        : null,
    currency: row.currency,
    duration: "once",
    active: true,
    timesRedeemed: 0,
    maxRedemptions: null,
    expiresAt: null,
  };
}

/** Subtotal / discount / total for a saved row, used by the email and the lists. */
export function rowPricing(row: PaymentLinkRow) {
  const items = Array.isArray(row.line_items)
    ? (row.line_items as Array<{ unitAmount?: number; quantity?: number; currency?: string }>).map(
        (item): PricingItem => ({
          unitAmount: item.unitAmount ?? 0,
          quantity: item.quantity ?? 1,
          currency: item.currency ?? row.currency ?? "inr",
        }),
      )
    : [
        {
          unitAmount: row.unit_amount ?? 0,
          quantity: row.quantity ?? 1,
          currency: row.currency ?? "inr",
        },
      ];

  return summarisePricing({ items, promotion: rowPromotion(row) });
}

export const listStripeCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const stripe = await stripeClient();
  const [pricesResult, promotionCodesResult] = await Promise.allSettled([
    stripe.prices.list({
      active: true,
      limit: 100,
      expand: ["data.product"],
    }),
    stripe.promotionCodes.list({
      active: true,
      limit: 100,
      // API version 2026-02-25.clover nests the coupon under `promotion`.
      expand: ["data.promotion.coupon"],
    }),
  ]);

  if (pricesResult.status === "rejected") {
    throw new Error(`Stripe products failed: ${errorMessage(pricesResult.reason)}`);
  }

  const prices = pricesResult.value;
  const promotionCodes =
    promotionCodesResult.status === "fulfilled" ? promotionCodesResult.value.data : [];

  return {
    products: prices.data
      .filter((price) => price.unit_amount !== null)
      .filter(isMumbaiStripePrice)
      .map((price) => ({
        priceId: price.id,
        productId: productId(price.product),
        name: productName(price.product),
        currency: price.currency,
        unitAmount: price.unit_amount ?? 0,
        displayAmount: money(price.unit_amount ?? 0, price.currency),
        recurring: price.recurring
          ? `${price.recurring.interval_count} ${price.recurring.interval}`
          : null,
      })),
    promotionCodes: promotionCodes.map((code) => {
      const couponObject = resolveCoupon(code);

      const summary: PromotionSummary = {
        id: code.id,
        code: code.code,
        couponId: couponObject?.id ?? "",
        percentOff: couponObject?.percent_off ?? null,
        amountOff: couponObject?.amount_off ?? null,
        currency: couponObject?.currency ?? null,
        duration: couponObject?.duration ?? null,
        active: code.active,
        timesRedeemed: code.times_redeemed ?? 0,
        maxRedemptions: code.max_redemptions ?? null,
        expiresAt: code.expires_at ?? null,
      };

      return { ...summary, label: describePromotion(summary).label };
    }),
    promoLoadError:
      promotionCodesResult.status === "rejected" ? errorMessage(promotionCodesResult.reason) : null,
  };
});

function momenceBasicAuthHeader() {
  const clientId = process.env.MOMENCE_CLIENT_ID;
  const clientSecret = process.env.MOMENCE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("MOMENCE_CLIENT_ID and MOMENCE_CLIENT_SECRET are required");
  }
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

async function requestMomenceToken(params: URLSearchParams) {
  const res = await fetch("https://api.momence.com/api/v2/auth/token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      Authorization: momenceBasicAuthHeader(),
    },
    body: params,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Momence auth ${res.status}: ${JSON.stringify(body)}`);
  }
  const accessToken = String(body?.access_token ?? body?.accessToken ?? "");
  const refreshToken = String(body?.refresh_token ?? body?.refreshToken ?? "");
  const accessTokenExpiresAt = Date.parse(String(body?.accessTokenExpiresAt ?? ""));
  const refreshTokenExpiresAt = Date.parse(String(body?.refreshTokenExpiresAt ?? ""));
  if (!accessToken || !refreshToken || Number.isNaN(accessTokenExpiresAt)) {
    throw new Error("Momence auth response did not include usable tokens");
  }
  momenceTokenCache = {
    accessToken,
    refreshToken,
    accessTokenExpiresAt,
    refreshTokenExpiresAt: Number.isNaN(refreshTokenExpiresAt) ? 0 : refreshTokenExpiresAt,
  };
  return momenceTokenCache;
}

async function getMomenceAccessToken() {
  const now = Date.now();
  const refreshBufferMs = 5 * 60 * 1000;
  if (momenceTokenCache && momenceTokenCache.accessTokenExpiresAt - now > refreshBufferMs) {
    return momenceTokenCache.accessToken;
  }

  if (
    momenceTokenCache?.refreshToken &&
    (!momenceTokenCache.refreshTokenExpiresAt ||
      momenceTokenCache.refreshTokenExpiresAt - now > refreshBufferMs)
  ) {
    try {
      const token = await requestMomenceToken(
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: momenceTokenCache.refreshToken,
        }),
      );
      return token.accessToken;
    } catch (error) {
      console.error("Momence refresh token failed; falling back to password grant", error);
    }
  }

  const username = process.env.MOMENCE_USERNAME;
  const password = process.env.MOMENCE_PASSWORD;
  if (!username || !password) {
    throw new Error("MOMENCE_USERNAME and MOMENCE_PASSWORD are required");
  }

  const token = await requestMomenceToken(
    new URLSearchParams({
      grant_type: "password",
      username,
      password,
    }),
  );
  return token.accessToken;
}

function memberItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const obj = value as Record<string, unknown>;
  for (const key of ["payload", "data", "items", "results", "members"]) {
    if (Array.isArray(obj[key])) return obj[key];
  }
  if (obj.data && typeof obj.data === "object") return memberItems(obj.data);
  return [];
}

export const searchMomenceMembers = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ query: z.string().trim().min(1).max(100) }).parse(input),
  )
  .handler(async ({ data }) => {
    const token = await getMomenceAccessToken();
    const params = new URLSearchParams({
      page: "0",
      pageSize: "20",
      sortOrder: "ASC",
      sortBy: "firstName",
      query: data.query,
    });
    const res = await fetch(`https://api.momence.com/api/v2/host/members?${params.toString()}`, {
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(`Momence members API ${res.status}: ${JSON.stringify(body)}`);
    }

    return {
      members: memberItems(body).map((item) => {
        const obj = item as Record<string, unknown>;
        const firstName = String(obj.firstName ?? obj.first_name ?? "");
        const lastName = String(obj.lastName ?? obj.last_name ?? "");
        const email = String(obj.email ?? "");
        const phone = String(obj.phoneNumber ?? obj.phone_number ?? obj.phone ?? "");
        return {
          id: String(obj.id ?? obj.memberId ?? ""),
          name: [firstName, lastName].filter(Boolean).join(" ") || String(obj.name ?? email),
          email,
          phone,
          raw: obj,
        };
      }),
    };
  });

export const createStripePaymentLink = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreatePaymentLinkSchema.parse(input))
  .handler(async ({ data }) => {
    const stripe = await stripeClient();
    const baseUrl = getBaseUrl();
    const payload = await buildPaymentLinkRequestPayload(stripe, data);

    const { data: row, error } = await supabaseAdmin
      .from("payment_link_requests")
      .insert(payload)
      .select()
      .single();

    if (error || !row) throw new Error(`Failed to save payment link request: ${error?.message}`);

    try {
      await sendApprovalEmail(row as PaymentLinkRow, baseUrl);
    } catch (e: unknown) {
      const message = errorMessage(e);
      await supabaseAdmin
        .from("payment_link_requests")
        .update({ error_message: `Email send failed: ${message}` })
        .eq("id", row.id);
      return {
        paymentLink: row as PaymentLinkRow,
        emailSent: false,
        emailError: message,
      };
    }

    return { paymentLink: row as PaymentLinkRow, emailSent: true };
  });

export const updateStripePaymentLinkRequest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => UpdatePaymentLinkSchema.parse(input))
  .handler(async ({ data }) => {
    const stripe = await stripeClient();
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("payment_link_requests")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);
    if (!existing) throw new Error("Payment link request not found");
    if (existing.stripe_payment_link_id || existing.status === "paid") {
      throw new Error("Payment link requests cannot be edited after approval or payment");
    }

    const payload = await buildPaymentLinkRequestPayload(stripe, data);
    const { data: row, error } = await supabaseAdmin
      .from("payment_link_requests")
      .update({
        ...payload,
        custom_coupon_id: null,
        custom_promotion_code_id: null,
        status: "pending",
        error_message: null,
      })
      .eq("id", data.id)
      .is("stripe_payment_link_id", null)
      .select()
      .single();

    if (error || !row) throw new Error(`Failed to update request: ${error?.message}`);
    return { paymentLink: row as PaymentLinkRow };
  });

function buildApprovalEmail(row: PaymentLinkRow, baseUrl: string) {
  const approveUrl = `${baseUrl}/api/public/stripe-payment-link/decision?token=${row.approve_token}&action=approve`;
  const rejectUrl = `${baseUrl}/api/public/stripe-payment-link/decision?token=${row.reject_token}&action=reject`;
  const pricing = rowPricing(row);
  const promotion = describePromotion(rowPromotion(row));
  const currency = row.currency ?? "inr";

  const rows: Array<[string, string]> = [
    ["Product", row.product_name ?? "Stripe product"],
    ["Quantity", String(row.quantity ?? 1)],
    ["Subtotal", money(pricing.subtotal, currency)],
  ];

  if (promotion.code) {
    rows.push(["Promo code", promotion.discountLabel ? promotion.label : promotion.code]);
  } else {
    rows.push(["Promo code", "None"]);
  }
  if (pricing.discountAmount > 0) {
    rows.push([
      "Discount",
      `− ${money(pricing.discountAmount, currency)}${
        pricing.discountLabel ? ` (${pricing.discountLabel})` : ""
      }`,
    ]);
  }

  rows.push(["Amount payable", money(pricing.total, currency)]);
  rows.push(["Customer", row.customer_email || row.customer_name || "Not specified"]);
  rows.push(["Created by", row.created_by || "Not specified"]);

  if (row.purpose) rows.push(["Purpose", row.purpose]);
  if (row.internal_note) rows.push(["Internal note", row.internal_note]);
  if (row.link_expires_at) {
    rows.push(["Link expires", new Date(row.link_expires_at).toLocaleString("en-IN")]);
  }
  if (row.max_redemptions) rows.push(["Max redemptions", String(row.max_redemptions)]);

  const tableRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;vertical-align:top;width:140px;">${escapeHtml(k)}</td><td style="padding:8px 12px;color:#0f172a;font-size:14px;border-bottom:1px solid #f1f5f9;">${escapeHtml(v)}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:620px;margin:0 auto;padding:32px 16px;">
    <div style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="background:linear-gradient(135deg,#0f172a,#6366f1);padding:28px 32px;">
        <div style="color:rgba(255,255,255,0.85);font-size:12px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">Stripe · Payment link approval</div>
        <h1 style="color:#fff;margin:8px 0 0;font-size:22px;font-weight:700;">New payment link request</h1>
      </div>
      <div style="padding:24px 32px;">
        <p style="margin:0 0 18px;color:#334155;font-size:14px;line-height:1.6;">A Stripe payment link is awaiting approval. It will not be created in Stripe until approved.</p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #f1f5f9;">${tableRows}</table>
        <div style="margin:28px 0 8px;">
          <a href="${approveUrl}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:14px;">Approve & create link</a>
          <a href="${rejectUrl}" style="display:inline-block;background:#fff;color:#dc2626;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:14px;border:1px solid #fecaca;margin-left:8px;">Reject</a>
        </div>
      </div>
    </div>
  </div></body></html>`;

  const text = `New Stripe payment link request\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nApprove: ${approveUrl}\nReject: ${rejectUrl}`;
  return { html, text };
}

function detailRows(rows: Array<[string, string]>) {
  return rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;vertical-align:top;width:140px;">${escapeHtml(k)}</td><td style="padding:8px 12px;color:#0f172a;font-size:14px;border-bottom:1px solid #f1f5f9;word-break:break-all;">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
}

/**
 * Sent once the link exists in Stripe, so whoever approved it has the URL in
 * hand without going back to the dashboard — and can see at a glance whether
 * the promo code is preset, prefilled in the URL, or left for the customer.
 */
function buildCreatedEmail(row: PaymentLinkRow, promoState: PromoState) {
  const pricing = rowPricing(row);
  const promotion = describePromotion(rowPromotion(row));
  const currency = row.currency ?? "inr";
  const url = row.stripe_payment_link_url ?? "";

  const rows: Array<[string, string]> = [
    ["Product", row.product_name ?? "Stripe product"],
    ["Quantity", String(row.quantity ?? 1)],
    ["Subtotal", money(pricing.subtotal, currency)],
  ];

  if (promotion.code) {
    rows.push(["Promo code", promotion.discountLabel ? promotion.label : promotion.code]);
  }
  if (pricing.discountAmount > 0) {
    rows.push([
      "Discount",
      `− ${money(pricing.discountAmount, currency)}${
        pricing.discountLabel ? ` (${pricing.discountLabel})` : ""
      }`,
    ]);
  }

  rows.push(["Amount payable", money(pricing.total, currency)]);
  rows.push(["Customer", row.customer_email || row.customer_name || "Not specified"]);
  rows.push(["Created by", row.created_by || "Not specified"]);
  if (row.purpose) rows.push(["Purpose", row.purpose]);
  if (row.link_expires_at) {
    rows.push(["Link expires", new Date(row.link_expires_at).toLocaleString("en-IN")]);
  }
  if (row.max_redemptions) rows.push(["Max redemptions", String(row.max_redemptions)]);
  rows.push(["Stripe link ID", row.stripe_payment_link_id ?? "—"]);

  const promoNote =
    promoState.kind === "preset"
      ? `The discount is applied to the link itself — the customer sees the reduced price straight away.`
      : promoState.kind === "prefilled"
        ? `Stripe could not preset the discount on this link, so the code <strong>${escapeHtml(promoState.code)}</strong> is prefilled in the URL instead. It applies automatically as long as the link is sent exactly as shown above.`
        : promoState.kind === "manual"
          ? `The discount could not be preset or prefilled. The customer must type the code at checkout.`
          : "";

  const html = `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:620px;margin:0 auto;padding:32px 16px;">
    <div style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="background:linear-gradient(135deg,#065f46,#10b981);padding:28px 32px;">
        <div style="color:rgba(255,255,255,0.85);font-size:12px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">Stripe · Payment link created</div>
        <h1 style="color:#fff;margin:8px 0 0;font-size:22px;font-weight:700;">${escapeHtml(row.product_name ?? "Stripe product")}</h1>
      </div>
      <div style="padding:24px 32px;">
        <p style="margin:0 0 18px;color:#334155;font-size:14px;line-height:1.6;">The payment link is live in Stripe and ready to send.</p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;font-size:13px;color:#0f172a;word-break:break-all;margin-bottom:18px;">${escapeHtml(url)}</div>
        <div style="margin:0 0 22px;">
          <a href="${escapeHtml(url)}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:14px;">Open payment link</a>
        </div>
        <table style="width:100%;border-collapse:collapse;border:1px solid #f1f5f9;">${detailRows(rows)}</table>
        ${
          promoNote
            ? `<p style="margin:18px 0 0;color:#475569;font-size:13px;line-height:1.6;">${promoNote}</p>`
            : ""
        }
      </div>
    </div>
  </div></body></html>`;

  const text = `Stripe payment link created\n\n${url}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}`;
  return { html, text };
}

/** The approver, plus whoever raised the request when that is an address. */
function createdEmailRecipients(row: PaymentLinkRow) {
  const recipients = new Set([APPROVAL_EMAIL]);
  const creator = row.created_by?.trim();
  if (creator && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(creator)) recipients.add(creator);
  return [...recipients];
}

async function sendCreatedEmail(row: PaymentLinkRow, promoState: PromoState) {
  const email = buildCreatedEmail(row, promoState);
  for (const to of createdEmailRecipients(row)) {
    await sendMailtrap({
      to,
      subject: `[Created] Stripe payment link — ${row.product_name ?? "Stripe product"}`,
      html: email.html,
      text: email.text,
    });
  }
}

async function sendApprovalEmail(row: PaymentLinkRow, baseUrl: string) {
  const email = buildApprovalEmail(row, baseUrl);
  await sendMailtrap({
    to: APPROVAL_EMAIL,
    subject: `[Approval needed] Stripe payment link ${row.product_name}`,
    html: email.html,
    text: email.text,
  });
}

/**
 * Whether a payment link can carry a preset discount depends on the account's
 * Stripe API version: `discounts` exists on older versions and is gone in
 * 2026-02-25.clover. Rather than guess, try with the discount and fall back to
 * letting the customer enter the code, reporting which path was taken.
 */
type PromoState =
  | { kind: "none" }
  | { kind: "preset" }
  | { kind: "prefilled"; code: string }
  | { kind: "manual" };

async function createPaymentLinkWithDiscountFallback(
  stripe: Awaited<ReturnType<typeof stripeClient>>,
  params: Stripe.PaymentLinkCreateParams & { discounts?: unknown },
) {
  try {
    const paymentLink = await stripe.paymentLinks.create(params);
    return { paymentLink, discountApplied: Boolean(params.discounts) };
  } catch (error) {
    const unknownParam =
      error && typeof error === "object" && "param" in error && error.param === "discounts";
    if (!params.discounts || !unknownParam) throw error;

    const { discounts: _discounts, ...rest } = params;
    const paymentLink = await stripe.paymentLinks.create({
      ...rest,
      allow_promotion_codes: true,
    });
    return { paymentLink, discountApplied: false };
  }
}

export async function createApprovedStripePaymentLink(row: PaymentLinkRow) {
  const stripe = await stripeClient();
  const baseUrl = getBaseUrl();
  let promotionCodeId = row.promotion_code_id;
  let couponId: string | null = null;
  let customPromotionCodeId: string | null = null;

  if (row.promotion_code && !promotionCodeId) {
    const coupon = await stripe.coupons.create({
      name: `Payment link ${row.promotion_code}`,
      duration: "once",
      currency: row.custom_promo_type === "fixed" ? row.currency : undefined,
      amount_off:
        row.custom_promo_type === "fixed" && row.custom_promo_value
          ? Math.round(Number(row.custom_promo_value) * 100)
          : undefined,
      percent_off:
        row.custom_promo_type === "percentage" && row.custom_promo_value
          ? Number(row.custom_promo_value)
          : undefined,
      metadata: { payment_link_request_id: row.id },
    });
    const promo = await stripe.promotionCodes.create({
      // 2026-02-25.clover takes the coupon nested under `promotion`.
      promotion: { type: "coupon", coupon: coupon.id },
      code: row.promotion_code,
      metadata: { payment_link_request_id: row.id },
    });
    couponId = coupon.id;
    customPromotionCodeId = promo.id;
    promotionCodeId = promo.id;
  }

  const lineItems = Array.isArray(row.line_items)
    ? (row.line_items as Array<{ priceId?: string; quantity?: number }>)
    : [{ priceId: row.stripe_price_id, quantity: row.quantity }];
  const customFields = Array.isArray(row.custom_fields)
    ? (row.custom_fields as Array<{
        key?: string;
        label?: string;
        type?: "text" | "numeric";
        optional?: boolean;
      }>)
    : [];
  const utm =
    row.utm_parameters && typeof row.utm_parameters === "object" ? row.utm_parameters : {};

  const createParams: Stripe.PaymentLinkCreateParams & { discounts?: unknown } = {
    line_items: lineItems.map((item) => ({
      price: item.priceId || row.stripe_price_id || "",
      quantity: item.quantity || 1,
      adjustable_quantity: row.adjustable_quantity ? { enabled: true, minimum: 1 } : undefined,
    })),
    billing_address_collection: row.collect_address ? "required" : "auto",
    phone_number_collection: row.collect_phone ? { enabled: true } : undefined,
    restrictions: row.max_redemptions
      ? { completed_sessions: { limit: row.max_redemptions } }
      : row.single_use
        ? { completed_sessions: { limit: 1 } }
        : undefined,
    inactive_message: row.link_expires_at
      ? "This payment link has expired. Please contact the studio for a new link."
      : undefined,
    custom_fields: customFields.map((field) => ({
      key: field.key ?? "custom_field",
      label: { type: "custom", custom: field.label ?? "Custom field" },
      type: field.type ?? "text",
      optional: field.optional ?? true,
    })),
    after_completion:
      row.after_completion_type === "message"
        ? {
            type: "hosted_confirmation",
            hosted_confirmation: {
              custom_message: row.after_completion_message ?? "Thank you for your payment.",
            },
          }
        : {
            type: "redirect",
            redirect: {
              url: row.after_completion_redirect_url || `${baseUrl}/payment-links?payment=success`,
            },
          },
    metadata: {
      payment_link_request_id: row.id,
      customer_email: row.customer_email ?? "",
      purpose: row.purpose ?? "",
      momence_member_id: row.momence_member_id ?? "",
      description: row.description ?? "",
      utm_source: String((utm as Record<string, unknown>).source ?? ""),
      utm_medium: String((utm as Record<string, unknown>).medium ?? ""),
      utm_campaign: String((utm as Record<string, unknown>).campaign ?? ""),
    },
  };

  // A preset discount and a customer-entered code are mutually exclusive.
  if (promotionCodeId) {
    createParams.discounts = [{ promotion_code: promotionCodeId }];
  } else if (row.allow_promotion_codes) {
    createParams.allow_promotion_codes = true;
  }

  const { paymentLink, discountApplied } = await createPaymentLinkWithDiscountFallback(
    stripe,
    createParams,
  );
  const url = new URL(paymentLink.url);
  for (const [key, value] of Object.entries(utm as Record<string, unknown>)) {
    if (value) url.searchParams.set(`utm_${key}`, String(value));
  }

  // When the discount could not be preset, Stripe still accepts the code
  // prefilled in the URL, so the customer never has to type it.
  let prefilledPromoCode: string | null = null;
  if (promotionCodeId && !discountApplied) {
    prefilledPromoCode = row.promotion_code ?? null;
    if (!prefilledPromoCode) {
      try {
        const promo = await stripe.promotionCodes.retrieve(promotionCodeId);
        prefilledPromoCode = promo.code ?? null;
      } catch {
        prefilledPromoCode = null;
      }
    }
    if (prefilledPromoCode) {
      url.searchParams.set("prefilled_promo_code", prefilledPromoCode);
    }
  }

  const { data: updated, error } = await supabaseAdmin
    .from("payment_link_requests")
    .update({
      status: "created",
      approved_at: new Date().toISOString(),
      stripe_payment_link_id: paymentLink.id,
      stripe_payment_link_url: url.toString(),
      promotion_code_id: promotionCodeId,
      custom_coupon_id: couponId,
      custom_promotion_code_id: customPromotionCodeId,
      stripe_response: toJson(paymentLink),
      allow_promotion_codes: paymentLink.allow_promotion_codes ?? row.allow_promotion_codes,
      error_message:
        promotionCodeId && !discountApplied && !prefilledPromoCode
          ? "This Stripe API version cannot preset a discount on a payment link, and the promo code could not be read back to prefill it. The customer must enter the code."
          : null,
    })
    .eq("id", row.id)
    .select()
    .single();

  if (error || !updated) throw new Error(`Failed to save approved Stripe link: ${error?.message}`);
  const saved = updated as PaymentLinkRow;

  const promoState: PromoState = !promotionCodeId
    ? { kind: "none" }
    : discountApplied
      ? { kind: "preset" }
      : prefilledPromoCode
        ? { kind: "prefilled", code: prefilledPromoCode }
        : { kind: "manual" };

  // The link exists either way; a failed notification must not undo that.
  try {
    await sendCreatedEmail(saved, promoState);
  } catch (e) {
    console.error("Payment link created email failed", e);
  }

  return saved;
}

export const listStripePaymentLinks = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("payment_link_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);

  const links = (data ?? []) as PaymentLinkRow[];
  return {
    links: links.map((link) => {
      const pricing = rowPricing(link);
      const promotion = describePromotion(rowPromotion(link));
      return {
        ...link,
        pricing,
        promotionCode: promotion.code,
        promotionLabel: promotion.label,
        promotionDiscountLabel: promotion.discountLabel,
        isExpired: Boolean(
          link.link_expires_at && new Date(link.link_expires_at).getTime() < Date.now(),
        ),
      };
    }),
    analytics: {
      totalLinks: links.length,
      paidLinks: links.filter((link) => link.status === "paid").length,
      totalRevenue: links.reduce((sum, link) => sum + (link.total_paid_amount ?? 0), 0),
      totalPayments: links.reduce((sum, link) => sum + (link.payment_count ?? 0), 0),
    },
  };
});

/**
 * Pulls one link's current state from Stripe and writes it back. Webhooks are
 * the primary path; this exists for when one is missed, and it also retires
 * links that have passed their expiry date (Stripe has no native expiry).
 */
export const syncStripePaymentLink = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const stripe = await stripeClient();
    const { data: row, error } = await supabaseAdmin
      .from("payment_link_requests")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    const link = row as PaymentLinkRow | null;
    if (!link?.stripe_payment_link_id) throw new Error("This request has no Stripe link yet");

    const expired = Boolean(
      link.link_expires_at && new Date(link.link_expires_at).getTime() < Date.now(),
    );

    const paymentLink =
      expired && link.status !== "inactive"
        ? await stripe.paymentLinks.update(link.stripe_payment_link_id, { active: false })
        : await stripe.paymentLinks.retrieve(link.stripe_payment_link_id);

    const sessions = await stripe.checkout.sessions.list({
      payment_link: link.stripe_payment_link_id,
      limit: 100,
    });
    const paidSessions = sessions.data.filter((session) => session.payment_status === "paid");
    const totalPaid = paidSessions.reduce((sum, session) => sum + (session.amount_total ?? 0), 0);
    const lastPaidAt = paidSessions
      .map((session) => session.created)
      .sort((a, b) => b - a)
      .at(0);

    const status: PaymentLinkRow["status"] = paidSessions.length
      ? "paid"
      : paymentLink.active
        ? "created"
        : "inactive";

    const { error: updateError } = await supabaseAdmin
      .from("payment_link_requests")
      .update({
        status,
        payment_count: paidSessions.length,
        total_paid_amount: totalPaid,
        last_payment_at: lastPaidAt ? new Date(lastPaidAt * 1000).toISOString() : null,
        checkout_session_ids: paidSessions.map((session) => session.id),
        stripe_response: toJson(paymentLink),
      })
      .eq("id", link.id);

    if (updateError) throw new Error(updateError.message);
    return { ok: true, status, paymentCount: paidSessions.length, expired };
  });

export const setStripePaymentLinkActive = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(input),
  )
  .handler(async ({ data }) => {
    const stripe = await stripeClient();
    const { data: row, error } = await supabaseAdmin
      .from("payment_link_requests")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!row?.stripe_payment_link_id) throw new Error("Payment link not found");

    const paymentLink = await stripe.paymentLinks.update(row.stripe_payment_link_id, {
      active: data.active,
    });

    const { error: updateError } = await supabaseAdmin
      .from("payment_link_requests")
      .update({
        status: data.active ? "created" : "inactive",
        stripe_response: toJson(paymentLink),
      })
      .eq("id", data.id);

    if (updateError) throw new Error(updateError.message);
    return { ok: true };
  });
