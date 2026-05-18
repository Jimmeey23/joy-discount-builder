import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Tables } from "@/integrations/supabase/types";

const APPROVAL_EMAIL = "jimmeey@physique57india.com";
const MOMENCE_HOST_ID = 13752;
const OTHER_REASON = "Other (see notes)";
type DiscountRequestRow = Tables<"discount_requests">;

const SubmitSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9_$@!-]+$/),
    discountType: z.enum(["percentage", "fixed"]),
    discountValue: z.number().min(0.01).max(1000000),
    usageLimitType: z.enum(["unlimited", "limited"]),
    usageAmount: z.number().int().min(1).max(1000000).nullable().optional(),
    renewalLimitType: z.enum(["unlimited", "limited"]),
    renewalsCount: z.number().int().min(1).max(1000).nullable().optional(),
    expiresAt: z.string().trim().min(1),
    appliesTo: z.enum(["everything", "specific"]),
    membershipIds: z.array(z.number().int()).max(500),
    membershipNames: z.array(z.string()).max(500),
    associateName: z.string().trim().min(1).max(100),
    location: z.string().min(1).max(200),
    reason: z.string().trim().min(1).max(200),
    notes: z.string().max(2000).optional().nullable(),
    description: z.string().max(500).optional().nullable(),
    requestedBy: z.string().max(100).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.reason === OTHER_REASON && !data.notes?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Notes are required when reason is Other",
        path: ["notes"],
      });
    }
  });

const STABLE_PUBLIC_URL = "https://project--5d498845-315c-4003-af46-2a005cd23f71.lovable.app";

function getBaseUrl() {
  const override = process.env.PUBLIC_APP_URL;
  if (override) return override.replace(/\/$/, "");
  try {
    const proto = getRequestHeader("x-forwarded-proto") || "https";
    const host = getRequestHost();
    if (host) {
      return `${proto}://${host}`;
    }
  } catch {
    return STABLE_PUBLIC_URL;
  }
  return STABLE_PUBLIC_URL;
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
      category: "discount-approval",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mailtrap send failed [${res.status}]: ${body}`);
  }
  return res.json();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function buildApprovalEmail(opts: {
  baseUrl: string;
  approveToken: string;
  rejectToken: string;
  row: DiscountRequestRow;
}) {
  const { baseUrl, approveToken, rejectToken, row } = opts;
  const approveUrl = `${baseUrl}/api/public/discount/decision?token=${approveToken}&action=approve`;
  const rejectUrl = `${baseUrl}/api/public/discount/decision?token=${rejectToken}&action=reject`;

  const valueDisplay =
    row.discount_type === "percentage" ? `${row.discount_value}%` : `₹${row.discount_value}`;
  const usageDisplay =
    row.usage_limit_type === "unlimited" ? "Unlimited" : `${row.usage_amount} uses`;
  const renewalDisplay =
    row.renewal_limit_type === "unlimited" ? "Unlimited" : `${row.renewals_count} renewals`;
  const expiryDisplay = row.expires_at
    ? new Date(row.expires_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    : "No expiration";
  const appliesDisplay =
    row.applies_to === "everything" ? "Everything" : `${row.membership_names.length} memberships`;

  const rows: Array<[string, string]> = [
    ["Discount code", row.code],
    ["Type", row.discount_type === "percentage" ? "Percentage" : "Fixed value"],
    ["Value", valueDisplay],
    ["Usage limit", usageDisplay],
    ["Renewals", renewalDisplay],
    ["Expiration", expiryDisplay],
    ["Applies to", appliesDisplay],
    ["Associate", row.associate_name],
    ["Location", row.location],
    ["Reason", row.reason],
  ];
  if (row.notes) rows.push(["Notes", row.notes]);
  if (row.description) rows.push(["Description", row.description]);
  if (row.requested_by) rows.push(["Requested by", row.requested_by]);
  if (row.applies_to === "specific" && row.membership_names.length) {
    rows.push(["Memberships", row.membership_names.join(", ")]);
  }

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
      <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;">
        <div style="color:rgba(255,255,255,0.85);font-size:12px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">Momence · Discount approval</div>
        <h1 style="color:#fff;margin:8px 0 0;font-size:22px;font-weight:700;">New discount code request</h1>
      </div>
      <div style="padding:24px 32px;">
        <p style="margin:0 0 18px;color:#334155;font-size:14px;line-height:1.6;">
          A new discount code is awaiting your approval. Review the details below and choose an action.
        </p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #f1f5f9;border-radius:8px;overflow:hidden;">
          ${tableRows}
        </table>
        <div style="margin:28px 0 8px;display:flex;gap:12px;">
          <a href="${approveUrl}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:14px;">Approve & create code</a>
          <a href="${rejectUrl}" style="display:inline-block;background:#ffffff;color:#dc2626;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:14px;border:1px solid #fecaca;margin-left:8px;">Reject</a>
        </div>
        <p style="margin:18px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;">
          Each link can only be used once. Approving will immediately create the discount code in Momence for host ${MOMENCE_HOST_ID}.
        </p>
      </div>
    </div>
    <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:16px;">Sent by the Momence Discount Approvals app.</p>
  </div>
</body></html>`;

  const text = `New discount request

${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}

Approve: ${approveUrl}
Reject:  ${rejectUrl}`;

  return { html, text };
}

export const submitDiscountRequest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SubmitSchema.parse(input))
  .handler(async ({ data }) => {
    const baseUrl = getBaseUrl();

    const { data: row, error } = await supabaseAdmin
      .from("discount_requests")
      .insert({
        code: data.code,
        discount_type: data.discountType,
        discount_value: data.discountValue,
        usage_limit_type: data.usageLimitType,
        usage_amount: data.usageLimitType === "limited" ? (data.usageAmount ?? null) : null,
        renewal_limit_type: data.renewalLimitType,
        renewals_count: data.renewalLimitType === "limited" ? (data.renewalsCount ?? null) : null,
        expires_at: data.expiresAt || null,
        applies_to: data.appliesTo,
        membership_ids: data.appliesTo === "specific" ? data.membershipIds : [],
        membership_names: data.appliesTo === "specific" ? data.membershipNames : [],
        associate_name: data.associateName,
        location: data.location,
        reason: data.reason,
        notes: data.notes || null,
        description: data.description || null,
        requested_by: data.requestedBy || null,
      })
      .select()
      .single();

    if (error || !row) {
      console.error("Insert failed", error);
      throw new Error(`Failed to save request: ${error?.message ?? "unknown error"}`);
    }

    const { html, text } = buildApprovalEmail({
      baseUrl,
      approveToken: row.approve_token,
      rejectToken: row.reject_token,
      row,
    });

    try {
      await sendMailtrap({
        to: APPROVAL_EMAIL,
        subject: `[Approval needed] Discount code ${row.code}`,
        html,
        text,
      });
    } catch (e: unknown) {
      console.error("Mailtrap send error", e);
      const message = errorMessage(e);
      await supabaseAdmin
        .from("discount_requests")
        .update({ error_message: `Email send failed: ${message}` })
        .eq("id", row.id);
      return {
        id: row.id,
        code: row.code,
        emailSent: false,
        emailError: message,
        approveUrl: `${baseUrl}/api/public/discount/decision?token=${row.approve_token}&action=approve`,
        rejectUrl: `${baseUrl}/api/public/discount/decision?token=${row.reject_token}&action=reject`,
      };
    }

    return { id: row.id, code: row.code, emailSent: true };
  });

export const listDiscountRequests = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("discount_requests")
    .select(
      "id,code,status,discount_type,discount_value,applies_to,membership_names,associate_name,location,reason,notes,created_at,approved_at,error_message,momence_response",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return { requests: data ?? [] };
});
