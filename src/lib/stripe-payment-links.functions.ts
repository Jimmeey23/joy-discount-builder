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
    priceId: z.string().min(1),
    quantity: z.number().int().min(1).max(999),
    promoMode: z.enum(["none", "existing", "custom"]),
    promotionCodeId: z.string().optional().nullable(),
    customPromoCode: z.string().trim().max(64).optional().nullable(),
    customPromoType: z.enum(["percentage", "fixed"]).optional().nullable(),
    customPromoValue: z.number().min(0.01).max(1000000).optional().nullable(),
    customerEmail: z.string().email().optional().nullable(),
    customerName: z.string().max(120).optional().nullable(),
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

export const createStripePaymentLink = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreatePaymentLinkSchema.parse(input))
  .handler(async ({ data }) => {
    const stripe = await stripeClient();
    const price = await stripe.prices.retrieve(data.priceId, { expand: ["product"] });
    const unitAmount = price.unit_amount ?? 0;
    const name = productName(price.product);
    const baseUrl = getBaseUrl();

    const { data: row, error } = await supabaseAdmin
      .from("stripe_payment_links")
      .insert({
        stripe_price_id: price.id,
        stripe_product_id: productId(price.product),
        product_name: name,
        currency: price.currency,
        unit_amount: unitAmount,
        quantity: data.quantity,
        requested_amount: unitAmount * data.quantity,
        promotion_code_id: data.promoMode === "existing" ? data.promotionCodeId : null,
        promotion_code:
          data.promoMode === "custom" ? data.customPromoCode?.trim().toUpperCase() : null,
        custom_promo_type: data.promoMode === "custom" ? data.customPromoType : null,
        custom_promo_value: data.promoMode === "custom" ? data.customPromoValue : null,
        customer_email: data.customerEmail || null,
        customer_name: data.customerName || null,
        purpose: data.purpose || null,
        created_by: data.createdBy || null,
      })
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
    const price = await stripe.prices.retrieve(data.priceId, { expand: ["product"] });
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

    const unitAmount = price.unit_amount ?? 0;
    const { data: row, error } = await supabaseAdmin
      .from("stripe_payment_links")
      .update({
        stripe_price_id: price.id,
        stripe_product_id: productId(price.product),
        product_name: productName(price.product),
        currency: price.currency,
        unit_amount: unitAmount,
        quantity: data.quantity,
        requested_amount: unitAmount * data.quantity,
        promotion_code_id: data.promoMode === "existing" ? data.promotionCodeId : null,
        promotion_code:
          data.promoMode === "custom" ? data.customPromoCode?.trim().toUpperCase() : null,
        custom_promo_type: data.promoMode === "custom" ? data.customPromoType : null,
        custom_promo_value: data.promoMode === "custom" ? data.customPromoValue : null,
        custom_coupon_id: null,
        custom_promotion_code_id: null,
        customer_email: data.customerEmail || null,
        customer_name: data.customerName || null,
        purpose: data.purpose || null,
        created_by: data.createdBy || null,
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

  const paymentLink = await stripe.paymentLinks.create({
    line_items: [{ price: row.stripe_price_id, quantity: row.quantity }],
    discounts: promotionCodeId ? [{ promotion_code: promotionCodeId }] : undefined,
    after_completion: {
      type: "redirect",
      redirect: { url: `${baseUrl}/payment-links?payment=success` },
    },
    metadata: {
      payment_link_request_id: row.id,
      customer_email: row.customer_email ?? "",
      purpose: row.purpose ?? "",
    },
  });

  const { data: updated, error } = await supabaseAdmin
    .from("stripe_payment_links")
    .update({
      status: "created",
      approved_at: new Date().toISOString(),
      stripe_payment_link_id: paymentLink.id,
      stripe_payment_link_url: paymentLink.url,
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
