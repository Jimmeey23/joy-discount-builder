import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createApprovedStripePaymentLink } from "@/lib/stripe-payment-links.functions";
import type { Tables } from "@/integrations/supabase/types";

type PaymentLinkRow = Tables<"stripe_payment_links">;

function page(opts: {
  title: string;
  message: string;
  detail?: string;
  status?: "ok" | "error" | "info";
}) {
  const color =
    opts.status === "error" ? "#dc2626" : opts.status === "info" ? "#6366f1" : "#10b981";
  const icon = opts.status === "error" ? "x" : opts.status === "info" ? "i" : "✓";
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${opts.title}</title></head>
<body style="margin:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:40px;max-width:560px;width:100%;box-shadow:0 4px 24px rgba(15,23,42,0.06);text-align:center;">
    <div style="width:64px;height:64px;border-radius:50%;background:${color};color:#fff;font-size:32px;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;">${icon}</div>
    <h1 style="margin:0 0 8px;font-size:22px;color:#0f172a;">${opts.title}</h1>
    <p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">${opts.message}</p>
    ${opts.detail ? `<pre style="margin-top:18px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;color:#475569;text-align:left;white-space:pre-wrap;word-break:break-word;">${opts.detail}</pre>` : ""}
  </div>
</body></html>`;
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
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

function samePromo(a: PaymentLinkRow, b: PaymentLinkRow) {
  return (
    (a.promotion_code_id ?? "") === (b.promotion_code_id ?? "") &&
    (a.promotion_code ?? "") === (b.promotion_code ?? "") &&
    (a.custom_promo_type ?? "") === (b.custom_promo_type ?? "") &&
    Number(a.custom_promo_value ?? 0) === Number(b.custom_promo_value ?? 0)
  );
}

async function findDuplicate(row: PaymentLinkRow) {
  const { data, error } = await supabaseAdmin
    .from("stripe_payment_links")
    .select("*")
    .neq("id", row.id)
    .eq("stripe_price_id", row.stripe_price_id)
    .eq("quantity", row.quantity)
    .eq("requested_amount", row.requested_amount)
    .not("stripe_payment_link_url", "is", null)
    .in("status", ["created", "paid", "inactive"]);

  if (error) throw new Error(error.message);
  return ((data ?? []) as PaymentLinkRow[]).find((candidate) => samePromo(row, candidate)) ?? null;
}

function duplicatePrompt(row: PaymentLinkRow, token: string, duplicate: PaymentLinkRow) {
  const useExistingUrl = `/api/public/stripe-payment-link/decision?token=${token}&action=use-existing&existingId=${duplicate.id}`;
  const createUrl = `/api/public/stripe-payment-link/decision?token=${token}&action=approve&create=1`;
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Matching payment link found</title></head>
<body style="margin:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:34px;max-width:680px;width:100%;box-shadow:0 4px 24px rgba(15,23,42,0.06);">
    <div style="width:56px;height:56px;border-radius:50%;background:#6366f1;color:#fff;font-size:28px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-bottom:18px;">i</div>
    <h1 style="margin:0 0 8px;font-size:22px;color:#0f172a;">Matching payment link found</h1>
    <p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.6;">A Stripe payment link already exists for ${escapeHtml(row.product_name)} at ${escapeHtml(money(row.requested_amount, row.currency))} with the same promo setup.</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;font-size:14px;color:#334155;word-break:break-all;">${escapeHtml(duplicate.stripe_payment_link_url ?? "Existing link")}</div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:24px;">
      <a href="${useExistingUrl}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;font-size:14px;">Use existing link</a>
      <a href="${createUrl}" style="display:inline-block;background:#fff;color:#0f172a;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;font-size:14px;border:1px solid #cbd5e1;">Create new link anyway</a>
    </div>
  </div>
</body></html>`;
}

export const Route = createFileRoute("/api/public/stripe-payment-link/decision")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        const action = url.searchParams.get("action");
        const createAnyway = url.searchParams.get("create") === "1";

        if (!token || (action !== "approve" && action !== "reject" && action !== "use-existing")) {
          return html(
            page({
              title: "Invalid link",
              message: "Missing or invalid approval token.",
              status: "error",
            }),
            400,
          );
        }

        const column = action === "reject" ? "reject_token" : "approve_token";
        const { data: row, error } = await supabaseAdmin
          .from("stripe_payment_links")
          .select("*")
          .eq(column, token)
          .maybeSingle();

        if (error || !row) {
          return html(
            page({
              title: "Request not found",
              message: "This approval link is invalid or expired.",
              status: "error",
            }),
            404,
          );
        }

        if (row.stripe_payment_link_id || row.status === "paid") {
          return html(
            page({
              title: "Already processed",
              message: `This payment link request is already ${row.status}.`,
              status: "info",
            }),
          );
        }

        if (action === "reject") {
          await supabaseAdmin
            .from("stripe_payment_links")
            .update({ status: "rejected" })
            .eq("id", row.id);
          return html(
            page({
              title: "Request rejected",
              message: "No Stripe payment link was created.",
              status: "info",
            }),
          );
        }

        if (action === "use-existing") {
          const existingId = url.searchParams.get("existingId");
          const { data: existing } = existingId
            ? await supabaseAdmin
                .from("stripe_payment_links")
                .select("*")
                .eq("id", existingId)
                .maybeSingle()
            : { data: null };

          await supabaseAdmin
            .from("stripe_payment_links")
            .update({
              status: "approved",
              approved_at: new Date().toISOString(),
              stripe_payment_link_id: existing?.stripe_payment_link_id ?? null,
              stripe_payment_link_url: existing?.stripe_payment_link_url ?? null,
              stripe_response: existing ? { reusedExistingPaymentLink: true, existingId } : null,
            })
            .eq("id", row.id);

          return html(
            page({
              title: "Approved using existing link",
              message: existing?.stripe_payment_link_url
                ? `Use existing Stripe payment link: ${existing.stripe_payment_link_url}`
                : "Approved to use an existing Stripe payment link.",
              status: "ok",
            }),
          );
        }

        try {
          if (!createAnyway) {
            const duplicate = await findDuplicate(row as PaymentLinkRow);
            if (duplicate) return html(duplicatePrompt(row as PaymentLinkRow, token, duplicate));
          }

          const updated = await createApprovedStripePaymentLink(row as PaymentLinkRow);
          return html(
            page({
              title: "Approved & created",
              message: updated.stripe_payment_link_url
                ? `Stripe payment link created: ${updated.stripe_payment_link_url}`
                : "Stripe payment link created.",
              status: "ok",
            }),
          );
        } catch (e: unknown) {
          await supabaseAdmin
            .from("stripe_payment_links")
            .update({
              status: "failed",
              error_message: errorMessage(e),
            })
            .eq("id", row.id);
          return html(
            page({
              title: "Failed to create payment link",
              message: "The Stripe API call failed.",
              detail: errorMessage(e),
              status: "error",
            }),
            500,
          );
        }
      },
    },
  },
});
