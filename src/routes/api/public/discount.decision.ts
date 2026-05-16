import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Tables } from "@/integrations/supabase/types";

const MOMENCE_HOST_ID = 13752;

type DiscountRequestRow = Tables<"discount_requests">;

type MomencePayload = {
  type: "percentage" | "fixed";
  discountPercentage: number | null;
  discountValue: number | null;
  code: string;
  description: string;
  isUnlimited: boolean;
  usageAmount: number | null;
  usageAmountGlobal: null;
  numberOfRenewalsDiscountIsValidFor: number | null;
  expiresAt: string | null;
  isUsableForGiftCards: false;
  isNewCustomersOnly: false;
  assignedEvents: [];
  assignedSessionTemplates: [];
  assignedProducts: [];
  assignedVideos: [];
  assignedAppointmentServices: [];
  assignedCourses: [];
  assignedMemberships: number[];
};

function page(opts: {
  title: string;
  message: string;
  detail?: string;
  status?: "ok" | "error" | "info";
}) {
  const color =
    opts.status === "error" ? "#dc2626" : opts.status === "info" ? "#6366f1" : "#10b981";
  const icon = opts.status === "error" ? "✕" : opts.status === "info" ? "i" : "✓";
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${opts.title}</title></head>
<body style="margin:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:40px;max-width:480px;width:100%;box-shadow:0 4px 24px rgba(15,23,42,0.06);text-align:center;">
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function callMomence(payload: MomencePayload) {
  const cookie = process.env.MOMENCE_COOKIE;
  if (!cookie) throw new Error("MOMENCE_COOKIE not configured");
  const res = await fetch(
    `https://momence.com/_api/primary/host/${MOMENCE_HOST_ID}/discount-codes`,
    {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json",
        cookie,
        origin: "https://momence.com",
        referer: `https://momence.com/dashboard/${MOMENCE_HOST_ID}/discount-codes/create`,
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        "x-idempotence-key": crypto.randomUUID(),
        "x-origin": `https://momence.com/dashboard/${MOMENCE_HOST_ID}/discount-codes/create`,
      },
      body: JSON.stringify(payload),
    },
  );
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, body: json };
}

function normalizeMembershipIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
}

function formatMomenceExpiresAt(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}T${byType.hour}:${byType.minute}:${byType.second}+05:30`;
}

function buildMomencePayload(row: DiscountRequestRow): MomencePayload {
  const isPct = row.discount_type === "percentage";
  const membershipIds = normalizeMembershipIds(row.membership_ids);

  return {
    type: isPct ? "percentage" : "fixed",
    discountPercentage: isPct ? Number(row.discount_value) : null,
    discountValue: isPct ? null : Number(row.discount_value),
    code: row.code,
    description: row.description ?? row.notes ?? "",
    isUnlimited: row.usage_limit_type === "unlimited",
    usageAmount: row.usage_limit_type === "limited" ? row.usage_amount : null,
    usageAmountGlobal: null,
    numberOfRenewalsDiscountIsValidFor:
      row.renewal_limit_type === "limited" ? row.renewals_count : null,
    expiresAt: formatMomenceExpiresAt(row.expires_at),
    isUsableForGiftCards: false,
    isNewCustomersOnly: false,
    assignedEvents: [],
    assignedSessionTemplates: [],
    assignedProducts: [],
    assignedVideos: [],
    assignedAppointmentServices: [],
    assignedCourses: [],
    assignedMemberships: membershipIds.length > 0 ? membershipIds : [],
  };
}

export const Route = createFileRoute("/api/public/discount/decision")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        const action = url.searchParams.get("action");

        if (!token || (action !== "approve" && action !== "reject")) {
          return html(
            page({
              title: "Invalid link",
              message: "Missing or invalid approval token.",
              status: "error",
            }),
            400,
          );
        }

        const column = action === "approve" ? "approve_token" : "reject_token";
        const { data: row, error } = await supabaseAdmin
          .from("discount_requests")
          .select("*")
          .eq(column, token)
          .maybeSingle();

        if (error || !row) {
          return html(
            page({
              title: "Request not found",
              message: "This link is invalid or has expired. The request may have been deleted.",
              status: "error",
            }),
            404,
          );
        }

        if (row.status !== "pending") {
          return html(
            page({
              title: `Already ${row.status}`,
              message: `Discount code "${row.code}" has already been ${row.status}.`,
              status: "info",
            }),
          );
        }

        if (action === "reject") {
          await supabaseAdmin
            .from("discount_requests")
            .update({ status: "rejected" })
            .eq("id", row.id);
          return html(
            page({
              title: "Request rejected",
              message: `Discount code "${row.code}" was rejected. No code has been created in Momence.`,
              status: "info",
            }),
          );
        }

        // Approve → call Momence
        try {
          const payload = buildMomencePayload(row);
          const result = await callMomence(payload);

          if (!result.ok) {
            await supabaseAdmin
              .from("discount_requests")
              .update({
                status: "failed",
                error_message: `Momence API ${result.status}`,
                momence_response: result.body,
              })
              .eq("id", row.id);
            return html(
              page({
                title: "Momence returned an error",
                message: `Approval recorded, but Momence rejected the discount creation (HTTP ${result.status}).`,
                detail: JSON.stringify(result.body, null, 2),
                status: "error",
              }),
              502,
            );
          }

          await supabaseAdmin
            .from("discount_requests")
            .update({
              status: "approved",
              approved_at: new Date().toISOString(),
              momence_response: result.body,
            })
            .eq("id", row.id);

          return html(
            page({
              title: "Approved & created",
              message: `Discount code "${row.code}" has been created in Momence.`,
              status: "ok",
            }),
          );
        } catch (e: unknown) {
          await supabaseAdmin
            .from("discount_requests")
            .update({
              status: "failed",
              error_message: errorMessage(e),
            })
            .eq("id", row.id);
          return html(
            page({
              title: "Failed to create code",
              message: "The Momence API call failed.",
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
