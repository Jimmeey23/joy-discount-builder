/**
 * Backfills `?prefilled_promo_code=` on payment links that were created before
 * the fallback learned to prefill it.
 *
 * Those links carry a promotion code that Stripe refused to preset (the newer
 * API version dropped `discounts` on payment links), so they went out with a
 * bare promo-code box and the customer had to type the code. Stripe still
 * honours the code in the URL, so the fix is to append it to the stored link.
 *
 * Run with:  npm run backfill:promo-urls -- --apply
 * Without --apply it prints what it would change and writes nothing.
 */

import { readFileSync } from "node:fs";
import Stripe from "stripe";
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

// No dotenv in this project, and the script only needs the few keys the
// server functions already read from the environment.
function loadEnvFile(file = ".env") {
  let contents = "";
  try {
    contents = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const line of contents.split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

loadEnvFile();

const APPLY = process.argv.includes("--apply");

function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" });
}

async function main() {
  const stripe = stripeClient();

  const { data, error } = await supabaseAdmin
    .from("payment_link_requests")
    .select(
      "id,product_name,promotion_code,promotion_code_id,stripe_payment_link_id,stripe_payment_link_url,allow_promotion_codes,error_message",
    )
    .not("stripe_payment_link_url", "is", null)
    .not("promotion_code_id", "is", null);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    id: string;
    product_name: string | null;
    promotion_code: string | null;
    promotion_code_id: string | null;
    stripe_payment_link_id: string | null;
    stripe_payment_link_url: string | null;
    allow_promotion_codes: boolean | null;
    error_message: string | null;
  }>;

  let changed = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.stripe_payment_link_url || !row.promotion_code_id) continue;

    const url = new URL(row.stripe_payment_link_url);
    if (url.searchParams.get("prefilled_promo_code")) {
      skipped++;
      continue;
    }

    // A link that really did preset the discount needs nothing; only the ones
    // that fell back to a promo-code box do.
    let presetDiscount = false;
    if (row.stripe_payment_link_id) {
      try {
        const link = (await stripe.paymentLinks.retrieve(row.stripe_payment_link_id)) as
          Stripe.PaymentLink & { discounts?: unknown[] };
        presetDiscount = Array.isArray(link.discounts) && link.discounts.length > 0;
      } catch (e) {
        console.warn(`  ! could not read link ${row.stripe_payment_link_id}: ${String(e)}`);
      }
    }
    if (presetDiscount) {
      skipped++;
      continue;
    }

    let code = row.promotion_code;
    if (!code) {
      try {
        code = (await stripe.promotionCodes.retrieve(row.promotion_code_id)).code ?? null;
      } catch {
        code = null;
      }
    }
    if (!code) {
      console.warn(`  ! ${row.id}: no promo code resolvable, left alone`);
      skipped++;
      continue;
    }

    url.searchParams.set("prefilled_promo_code", code);

    console.log(`${APPLY ? "updating" : "would update"} ${row.id} (${row.product_name ?? "—"})`);
    console.log(`    ${row.stripe_payment_link_url}`);
    console.log(` -> ${url.toString()}`);

    if (APPLY) {
      // The link also needs the promo box enabled for a prefilled code to take.
      if (!row.allow_promotion_codes && row.stripe_payment_link_id) {
        await stripe.paymentLinks.update(row.stripe_payment_link_id, {
          allow_promotion_codes: true,
        });
      }
      const { error: updateError } = await supabaseAdmin
        .from("payment_link_requests")
        .update({
          stripe_payment_link_url: url.toString(),
          allow_promotion_codes: true,
          error_message: null,
        })
        .eq("id", row.id);
      if (updateError) throw new Error(`${row.id}: ${updateError.message}`);
    }
    changed++;
  }

  console.log(
    `\n${APPLY ? "Updated" : "Would update"} ${changed} link(s); ${skipped} already fine.`,
  );
  if (!APPLY && changed > 0) console.log("Re-run with --apply to write the changes.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
