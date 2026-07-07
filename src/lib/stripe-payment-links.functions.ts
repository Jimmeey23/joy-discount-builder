import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json, Tables } from "@/integrations/supabase/types";
import type Stripe from "stripe";

type PaymentLinkRow = Tables<"stripe_payment_links">;

const APPROVAL_EMAIL = "jimmeey@physique57india.com";
const STABLE_PUBLIC_URL = "https://project--5d498845-315c-4003-af46-2a005cd23f71.lovable.app";

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
  })
  .superRefine((data, ctx) => {
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
  };
}

export const listStripeCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const stripe = await stripeClient();
  const [prices, promotionCodes] = await Promise.all([
    stripe.prices.list({
      active: true,
      limit: 100,
      expand: ["data.product"],
    }),
    stripe.promotionCodes.list({
      active: true,
      limit: 100,
      expand: ["data.coupon"],
    }),
  ]);

  return {
    products: prices.data
      .filter((price) => price.unit_amount !== null)
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
    promotionCodes: promotionCodes.data.map((code) => ({
      id: code.id,
      code: code.code,
      couponId: code.coupon.id,
      label: code.coupon.percent_off
        ? `${code.code} · ${code.coupon.percent_off}% off`
        : `${code.code} · ${money(code.coupon.amount_off ?? 0, code.coupon.currency ?? "inr")} off`,
    })),
  };
});

function momenceToken() {
  return process.env.MOMENCE_API_ACCESS_TOKEN || process.env.MOMENCE_BEARER_TOKEN || "";
}

function memberItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const obj = value as Record<string, unknown>;
  for (const key of ["data", "items", "results", "members"]) {
    if (Array.isArray(obj[key])) return obj[key];
  }
  return [];
}

export const searchMomenceMembers = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ query: z.string().trim().min(1).max(100) }).parse(input),
  )
  .handler(async ({ data }) => {
    const token = momenceToken();
    if (!token) throw new Error("MOMENCE_API_ACCESS_TOKEN is not configured");
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
      .from("stripe_payment_links")
      .insert(payload)
      .select()
      .single();

    if (error || !row) throw new Error(`Failed to save payment link request: ${error?.message}`);

    try {
      await sendApprovalEmail(row as PaymentLinkRow, baseUrl);
    } catch (e: unknown) {
      const message = errorMessage(e);
      await supabaseAdmin
        .from("stripe_payment_links")
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
      .from("stripe_payment_links")
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
      .from("stripe_payment_links")
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
  const rows: Array<[string, string]> = [
    ["Product", row.product_name],
    ["Amount", money(row.requested_amount, row.currency)],
    ["Quantity", String(row.quantity)],
    ["Promo", row.promotion_code || row.promotion_code_id || "None"],
    ["Customer", row.customer_email || row.customer_name || "Not specified"],
    ["Created by", row.created_by || "Not specified"],
  ];
  if (row.purpose) rows.push(["Purpose", row.purpose]);

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

async function sendApprovalEmail(row: PaymentLinkRow, baseUrl: string) {
  const email = buildApprovalEmail(row, baseUrl);
  await sendMailtrap({
    to: APPROVAL_EMAIL,
    subject: `[Approval needed] Stripe payment link ${row.product_name}`,
    html: email.html,
    text: email.text,
  });
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
      coupon: coupon.id,
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

  const paymentLink = await stripe.paymentLinks.create({
    line_items: lineItems.map((item) => ({
      price: item.priceId || row.stripe_price_id,
      quantity: item.quantity || 1,
    })),
    discounts: promotionCodeId ? [{ promotion_code: promotionCodeId }] : undefined,
    custom_fields: customFields.map((field) => ({
      key: field.key ?? "custom_field",
      label: { type: "custom", custom: field.label ?? "Custom field" },
      type: field.type ?? "text",
      optional: field.optional ?? true,
    })),
    after_completion: {
      type: "redirect",
      redirect: { url: `${baseUrl}/payment-links?payment=success` },
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
  });
  const url = new URL(paymentLink.url);
  for (const [key, value] of Object.entries(utm as Record<string, unknown>)) {
    if (value) url.searchParams.set(`utm_${key}`, String(value));
  }

  const { data: updated, error } = await supabaseAdmin
    .from("stripe_payment_links")
    .update({
      status: "created",
      approved_at: new Date().toISOString(),
      stripe_payment_link_id: paymentLink.id,
      stripe_payment_link_url: url.toString(),
      promotion_code_id: promotionCodeId,
      custom_coupon_id: couponId,
      custom_promotion_code_id: customPromotionCodeId,
      stripe_response: toJson(paymentLink),
      error_message: null,
    })
    .eq("id", row.id)
    .select()
    .single();

  if (error || !updated) throw new Error(`Failed to save approved Stripe link: ${error?.message}`);
  return updated as PaymentLinkRow;
}

export const listStripePaymentLinks = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("stripe_payment_links")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);

  const links = (data ?? []) as PaymentLinkRow[];
  return {
    links,
    analytics: {
      totalLinks: links.length,
      paidLinks: links.filter((link) => link.status === "paid").length,
      totalRevenue: links.reduce((sum, link) => sum + link.total_paid_amount, 0),
      totalPayments: links.reduce((sum, link) => sum + link.payment_count, 0),
    },
  };
});

export const setStripePaymentLinkActive = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), active: z.boolean() }).parse(input),
  )
  .handler(async ({ data }) => {
    const stripe = await stripeClient();
    const { data: row, error } = await supabaseAdmin
      .from("stripe_payment_links")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!row?.stripe_payment_link_id) throw new Error("Payment link not found");

    const paymentLink = await stripe.paymentLinks.update(row.stripe_payment_link_id, {
      active: data.active,
    });

    const { error: updateError } = await supabaseAdmin
      .from("stripe_payment_links")
      .update({
        status: data.active ? "created" : "inactive",
        stripe_response: toJson(paymentLink),
      })
      .eq("id", data.id);

    if (updateError) throw new Error(updateError.message);
    return { ok: true };
  });
