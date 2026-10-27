import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { sendPaymentReceivedEmail } from "@/lib/stripe-payment-links.functions";

function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" });
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) {
          return Response.json(
            { error: "STRIPE_WEBHOOK_SECRET is not configured" },
            { status: 500 },
          );
        }

        const signature = request.headers.get("stripe-signature");
        if (!signature) {
          return Response.json({ error: "Missing Stripe signature" }, { status: 400 });
        }

        const body = await request.text();
        let event: Stripe.Event;

        try {
          event = stripeClient().webhooks.constructEvent(body, signature, webhookSecret);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid webhook signature";
          return Response.json({ error: message }, { status: 400 });
        }

        // Card payments are paid on completion; delayed methods (UPI, bank
        // debits) complete unpaid and settle later via async_payment_succeeded.
        if (
          event.type === "checkout.session.completed" ||
          event.type === "checkout.session.async_payment_succeeded"
        ) {
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.payment_status === "unpaid") return Response.json({ received: true });

          const paymentLinkId =
            typeof session.payment_link === "string"
              ? session.payment_link
              : session.payment_link?.id;
          const localId = session.metadata?.payment_link_request_id;
          const amountPaid = session.amount_total ?? 0;
          const sessionId = session.id;

          // Requests approved with "use existing link" share the Stripe link
          // id, so pick the request that created the link rather than failing
          // on multiple matches.
          const { data: candidates, error } = localId
            ? await supabaseAdmin.from("payment_link_requests").select("*").eq("id", localId)
            : paymentLinkId
              ? await supabaseAdmin
                  .from("payment_link_requests")
                  .select("*")
                  .eq("stripe_payment_link_id", paymentLinkId)
                  .order("created_at", { ascending: true })
              : { data: [], error: null };

          if (error) {
            return Response.json({ error: error.message }, { status: 500 });
          }

          const row =
            candidates?.find((candidate) => candidate.status !== "approved") ?? candidates?.[0];

          if (row) {
            const existingSessions = row.checkout_session_ids ?? [];
            const alreadyTracked = existingSessions.includes(sessionId);
            const nextSessions = alreadyTracked
              ? existingSessions
              : [...existingSessions, sessionId];

            // Usage limits are enforced by the link's own restrictions; this
            // only covers single-use links created before those existed.
            if (paymentLinkId && !alreadyTracked && row.single_use && !row.max_redemptions) {
              await stripeClient().paymentLinks.update(paymentLinkId, { active: false });
            }

            const paidAt = new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000);
            const { data: updated, error: updateError } = await supabaseAdmin
              .from("payment_link_requests")
              .update({
                status: "paid",
                payment_count: alreadyTracked ? row.payment_count : row.payment_count + 1,
                total_paid_amount: alreadyTracked
                  ? row.total_paid_amount
                  : row.total_paid_amount + amountPaid,
                last_payment_at: paidAt.toISOString(),
                checkout_session_ids: nextSessions,
                last_event: toJson(event),
              })
              .eq("id", row.id)
              .select()
              .single();

            if (updateError) {
              return Response.json({ error: updateError.message }, { status: 500 });
            }

            // Stripe retries deliveries, so notify only the first time a
            // session is seen. A failed email must not make Stripe retry.
            if (!alreadyTracked && updated) {
              try {
                await sendPaymentReceivedEmail(updated, {
                  sessionId,
                  amount: amountPaid,
                  currency: session.currency ?? row.currency ?? "inr",
                  paidAt,
                  customerName: session.customer_details?.name ?? null,
                  customerEmail: session.customer_details?.email ?? null,
                  customerPhone: session.customer_details?.phone ?? null,
                  paymentIntentId:
                    typeof session.payment_intent === "string"
                      ? session.payment_intent
                      : (session.payment_intent?.id ?? null),
                });
              } catch (e) {
                console.error("Payment received email failed", e);
              }
            }
          }
        }

        return Response.json({ received: true });
      },
    },
  },
});
