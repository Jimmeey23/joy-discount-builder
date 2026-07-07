import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

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

        if (event.type === "checkout.session.completed") {
          const session = event.data.object as Stripe.Checkout.Session;
          const paymentLinkId =
            typeof session.payment_link === "string"
              ? session.payment_link
              : session.payment_link?.id;
          const localId = session.metadata?.payment_link_request_id;
          const amountPaid = session.amount_total ?? 0;
          const sessionId = session.id;

          const query = supabaseAdmin.from("stripe_payment_links").select("*");
          const { data: row, error } = localId
            ? await query.eq("id", localId).maybeSingle()
            : paymentLinkId
              ? await query.eq("stripe_payment_link_id", paymentLinkId).maybeSingle()
              : { data: null, error: null };

          if (error) {
            return Response.json({ error: error.message }, { status: 500 });
          }

          if (row) {
            const existingSessions = row.checkout_session_ids ?? [];
            const alreadyTracked = existingSessions.includes(sessionId);
            const nextSessions = alreadyTracked
              ? existingSessions
              : [...existingSessions, sessionId];

            if (paymentLinkId && !alreadyTracked) {
              await stripeClient().paymentLinks.update(paymentLinkId, { active: false });
            }

            const { error: updateError } = await supabaseAdmin
              .from("stripe_payment_links")
              .update({
                status: "paid",
                payment_count: alreadyTracked ? row.payment_count : row.payment_count + 1,
                total_paid_amount: alreadyTracked
                  ? row.total_paid_amount
                  : row.total_paid_amount + amountPaid,
                last_payment_at: new Date(
                  (session.created ?? Math.floor(Date.now() / 1000)) * 1000,
                ).toISOString(),
                checkout_session_ids: nextSessions,
                last_event: toJson(event),
              })
              .eq("id", row.id);

            if (updateError) {
              return Response.json({ error: updateError.message }, { status: 500 });
            }
          }
        }

        return Response.json({ received: true });
      },
    },
  },
});
