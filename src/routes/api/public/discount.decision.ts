import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Tables } from "@/integrations/supabase/types";

const MOMENCE_HOST_ID = 13752;
const STATUS_NOTIFICATION_EMAIL = "info@physique57india.com";

type DiscountRequestRow = Tables<"discount_requests">;

type MomencePayload = {
  type: "percentage" | "value";
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

type MomenceDiscountMatch = {
  code: string;
  value: number;
  expiresAt?: string | null;
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

function actionUrl(token: string, action: string, extra: Record<string, string> = {}) {
  const params = new URLSearchParams({ token, action, ...extra });
  return `/api/public/discount/decision?${params.toString()}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
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
      from: { email: sender, name: "Momence Discount Approvals" },
      to: [{ email: opts.to }],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      category: "discount-status",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mailtrap send failed [${res.status}]: ${body}`);
  }
  return res.json();
}

function buildStatusEmail(row: DiscountRequestRow, status: "approved" | "rejected") {
  const statusLabel = status === "approved" ? "Approved" : "Rejected";
  const valueDisplay =
    row.discount_type === "percentage" ? `${row.discount_value}%` : `₹${row.discount_value}`;
  const expiryDisplay = row.expires_at
    ? new Date(row.expires_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    : "No expiration";
  const rows: Array<[string, string]> = [
    ["Status", statusLabel],
    ["Discount code", row.code],
    ["Value", valueDisplay],
    ["Expiration", expiryDisplay],
    ["Associate", row.associate_name],
    ["Location", row.location],
    ["Reason", row.reason],
  ];
  if (row.notes) rows.push(["Notes", row.notes]);
  if (row.requested_by) rows.push(["Requested by", row.requested_by]);

  const tableRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;vertical-align:top;width:140px;">${escapeHtml(
          k,
        )}</td><td style="padding:8px 12px;color:#0f172a;font-size:14px;border-bottom:1px solid #f1f5f9;">${escapeHtml(
          String(v),
        )}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html><body style="margin:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:620px;margin:0 auto;padding:32px 16px;">
    <div style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
      <div style="background:${status === "approved" ? "#10b981" : "#64748b"};padding:24px 32px;">
        <div style="color:rgba(255,255,255,0.85);font-size:12px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">Momence · Discount status</div>
        <h1 style="color:#fff;margin:8px 0 0;font-size:22px;font-weight:700;">Discount request ${statusLabel.toLowerCase()}</h1>
      </div>
      <div style="padding:24px 32px;">
        <p style="margin:0 0 18px;color:#334155;font-size:14px;line-height:1.6;">
          The discount request decision has been recorded.
        </p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #f1f5f9;border-radius:8px;overflow:hidden;">
          ${tableRows}
        </table>
      </div>
    </div>
    <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:16px;">Sent by the Momence Discount Approvals app.</p>
  </div>
</body></html>`;

  const text = `Discount request ${status}

${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}`;

  return {
    subject: `[${statusLabel}] Discount code ${row.code}`,
    html,
    text,
  };
}

async function notifyStatus(row: DiscountRequestRow, status: "approved" | "rejected") {
  const message = buildStatusEmail(row, status);
  await sendMailtrap({
    to: STATUS_NOTIFICATION_EMAIL,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
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

async function fetchMomenceDiscountCodes() {
  const cookie = process.env.MOMENCE_COOKIE;
  if (!cookie) throw new Error("MOMENCE_COOKIE not configured");
  const res = await fetch(
    `https://momence.com/_api/primary/host/${MOMENCE_HOST_ID}/discount-codes?includeExpired=false`,
    {
      headers: {
        accept: "application/json, text/plain, */*",
        cookie,
        referer: `https://momence.com/dashboard/${MOMENCE_HOST_ID}/discount-codes`,
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        "x-origin": `https://momence.com/dashboard/${MOMENCE_HOST_ID}/discount-codes`,
      },
    },
  );
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`Momence discount list failed [${res.status}]: ${JSON.stringify(json)}`);
  }
  return json;
}

function candidateArrays(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const obj = value as Record<string, unknown>;
  for (const key of ["data", "discountCodes", "discount_codes", "items", "results"]) {
    if (Array.isArray(obj[key])) return obj[key];
  }
  return [];
}

function numericField(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function findSameValueDiscounts(row: DiscountRequestRow, momenceResponse: unknown) {
  const requestedType = row.discount_type === "percentage" ? "percentage" : "value";
  const requestedValue = Number(row.discount_value);
  const items = candidateArrays(momenceResponse);

  return items.flatMap((item): MomenceDiscountMatch[] => {
    if (!item || typeof item !== "object") return [];
    const obj = item as Record<string, unknown>;
    const itemType = String(obj.type ?? obj.discountType ?? "").toLowerCase();
    const value =
      requestedType === "percentage"
        ? numericField(obj, ["discountPercentage", "discount_percentage", "percentage", "value"])
        : numericField(obj, ["discountValue", "discount_value", "amount", "value"]);

    const typeMatches =
      requestedType === "percentage"
        ? itemType === "" || itemType.includes("percentage")
        : itemType === "" || itemType.includes("value") || itemType.includes("fixed");

    if (!typeMatches || value === null || Math.abs(value - requestedValue) > 0.001) {
      return [];
    }

    return [
      {
        code: String(obj.code ?? obj.name ?? "Existing discount code"),
        value,
        expiresAt: typeof obj.expiresAt === "string" ? obj.expiresAt : null,
      },
    ];
  });
}

function duplicatePromptPage(
  row: DiscountRequestRow,
  token: string,
  matches: MomenceDiscountMatch[],
) {
  const valueLabel =
    row.discount_type === "percentage" ? `${row.discount_value}%` : `₹${row.discount_value}`;
  const rows = matches
    .map(
      (match) =>
        `<tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(match.code)}</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(valueLabel)}</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;">${escapeHtml(match.expiresAt ?? "No expiry shown")}</td></tr>`,
    )
    .join("");
  const useExistingUrl = actionUrl(token, "use-existing", {
    existingCode: matches[0]?.code ?? "",
  });
  const createUrl = actionUrl(token, "approve", { create: "1" });

  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Matching discount found</title></head>
<body style="margin:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:34px;max-width:680px;width:100%;box-shadow:0 4px 24px rgba(15,23,42,0.06);">
    <div style="width:56px;height:56px;border-radius:50%;background:#6366f1;color:#fff;font-size:28px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-bottom:18px;">i</div>
    <h1 style="margin:0 0 8px;font-size:22px;color:#0f172a;">Matching Momence discount found</h1>
    <p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.6;">Momence already has an active ${escapeHtml(valueLabel)} discount. Use an existing code where possible, or create a new code if this request needs a distinct code.</p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;font-size:14px;">
      <thead style="background:#f8fafc;color:#64748b;text-align:left;"><tr><th style="padding:10px 12px;">Code</th><th style="padding:10px 12px;">Value</th><th style="padding:10px 12px;">Expiry</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:24px;">
      <a href="${useExistingUrl}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;font-size:14px;">Use existing code</a>
      <a href="${createUrl}" style="display:inline-block;background:#fff;color:#0f172a;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;font-size:14px;border:1px solid #cbd5e1;">Create new code anyway</a>
    </div>
  </div>
</body></html>`;
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

export function buildMomencePayload(row: DiscountRequestRow): MomencePayload {
  const isPct = row.discount_type === "percentage";
  const membershipIds = normalizeMembershipIds(row.membership_ids);

  return {
    type: isPct ? "percentage" : "value",
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
          try {
            await notifyStatus(row, "rejected");
          } catch (e: unknown) {
            console.error("Status notification email failed", e);
          }
          return html(
            page({
              title: "Request rejected",
              message: `Discount code "${row.code}" was rejected. No code has been created in Momence.`,
              status: "info",
            }),
          );
        }

        if (action === "use-existing") {
          const existingCode = url.searchParams.get("existingCode");
          await supabaseAdmin
            .from("discount_requests")
            .update({
              status: "approved",
              approved_at: new Date().toISOString(),
              momence_response: {
                reusedExistingDiscount: true,
                existingCode,
              },
            })
            .eq("id", row.id);
          try {
            await notifyStatus(row, "approved");
          } catch (e: unknown) {
            console.error("Status notification email failed", e);
          }
          return html(
            page({
              title: "Approved using existing code",
              message: existingCode
                ? `Use existing Momence discount code "${existingCode}" for this request. No new code was created.`
                : "Use an existing Momence discount code for this request. No new code was created.",
              status: "ok",
            }),
          );
        }

        // Approve → call Momence
        try {
          if (!createAnyway) {
            const existingDiscounts = await fetchMomenceDiscountCodes();
            const sameValueMatches = findSameValueDiscounts(row, existingDiscounts);
            if (sameValueMatches.length > 0) {
              return html(duplicatePromptPage(row, token, sameValueMatches));
            }
          }

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
          try {
            await notifyStatus(row, "approved");
          } catch (e: unknown) {
            console.error("Status notification email failed", e);
          }

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
