import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { listDiscountRequests } from "@/lib/discount.functions";
import {
  listStripePaymentLinks,
  syncStripePaymentLink,
} from "@/lib/stripe-payment-links.functions";
import { formatMoney } from "@/lib/payment-link-pricing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type RequestListRow = Pick<
  Tables<"discount_requests">,
  | "id"
  | "code"
  | "status"
  | "discount_type"
  | "discount_value"
  | "applies_to"
  | "membership_names"
  | "associate_name"
  | "location"
  | "created_at"
  | "error_message"
>;

type PaymentLinkListRow = Tables<"payment_link_requests"> & {
  pricing: { subtotal: number; discountAmount: number; total: number; currency: string };
  promotionCode: string;
  promotionLabel: string;
  promotionDiscountLabel: string;
  isExpired: boolean;
};

export const Route = createFileRoute("/requests")({
  component: RequestsPage,
  head: () => ({
    meta: [{ title: "Discount requests · Momence Approvals" }],
  }),
});

function RequestsPage() {
  const isChildRoute = useRouterState({
    select: (state) => state.location.pathname !== "/requests",
  });
  const queryClient = useQueryClient();
  const fn = useServerFn(listDiscountRequests);
  const linksFn = useServerFn(listStripePaymentLinks);
  const syncFn = useServerFn(syncStripePaymentLink);

  const { data, isLoading } = useQuery({
    queryKey: ["discount-requests"],
    queryFn: () => fn(),
    refetchInterval: 5000,
  });

  const links = useQuery({
    queryKey: ["stripe-payment-links"],
    queryFn: () => linksFn(),
    refetchInterval: 3000,
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => syncFn({ data: { id } }),
    onSuccess: (result) => {
      const synced = result as { status?: string; expired?: boolean };
      toast.success("Synced with Stripe", {
        description: synced.expired
          ? "Link passed its expiry date and was deactivated."
          : `Stripe reports this link as ${synced.status ?? "up to date"}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["stripe-payment-links"] });
    },
    onError: (error) => {
      toast.error("Could not sync with Stripe", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const linkRows = (links.data?.links ?? []) as PaymentLinkListRow[];

  if (isChildRoute) return <Outlet />;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-purple-500 grid place-items-center text-primary-foreground font-bold">
              %
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight">Momence Discount Codes</h1>
              <p className="text-xs text-muted-foreground">Physique 57 India · approval workflow</p>
            </div>
          </div>
          <nav className="flex items-center gap-1 text-sm">
            <Link
              to="/"
              activeOptions={{ exact: true }}
              activeProps={{ className: "bg-accent text-accent-foreground" }}
              className="px-3 py-1.5 rounded-md hover:bg-accent transition-colors"
            >
              Create
            </Link>
            <Link
              to="/requests"
              activeProps={{ className: "bg-accent text-accent-foreground" }}
              className="px-3 py-1.5 rounded-md hover:bg-accent transition-colors"
            >
              Requests
            </Link>
            <Link
              to="/payment-links"
              activeProps={{ className: "bg-accent text-accent-foreground" }}
              className="px-3 py-1.5 rounded-md hover:bg-accent transition-colors"
            >
              Payment Links
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Discount requests</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              All submitted discount code requests and their current approval state. Refreshes
              automatically.
            </p>
          </div>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition"
          >
            + New request
          </Link>
        </div>

        <div className="bg-background border rounded-2xl overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !data?.requests.length ? (
            <div className="py-20 text-center">
              <p className="text-sm text-muted-foreground">
                No requests yet. Create your first discount code request.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-5 py-3 font-medium">Code</th>
                  <th className="text-left px-5 py-3 font-medium">Discount</th>
                  <th className="text-left px-5 py-3 font-medium">Associate</th>
                  <th className="text-left px-5 py-3 font-medium">Location</th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="text-right px-5 py-3 font-medium">Created</th>
                  <th className="text-right px-5 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {(data.requests as RequestListRow[]).map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30 transition">
                    <td className="px-5 py-3 font-mono font-medium">
                      {r.status === "approved" ? (
                        r.code
                      ) : (
                        <Link
                          to="/requests/$requestId/edit"
                          params={{ requestId: r.id }}
                          className="text-primary hover:underline"
                        >
                          {r.code}
                        </Link>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {r.discount_type === "percentage"
                        ? `${r.discount_value}%`
                        : `₹${r.discount_value}`}
                      <span className="text-xs ml-2 text-muted-foreground/70">
                        {r.applies_to === "everything"
                          ? "everything"
                          : `${r.membership_names?.length ?? 0} memberships`}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{r.associate_name}</td>
                    <td className="px-5 py-3 text-muted-foreground truncate max-w-[180px]">
                      {r.location}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={r.status} />
                      {r.error_message && (
                        <div
                          className="text-xs text-destructive mt-1 max-w-[240px] truncate"
                          title={r.error_message}
                        >
                          {r.error_message}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-muted-foreground text-xs">
                      {new Date(r.created_at).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {r.status === "approved" ? (
                        <span className="text-xs text-muted-foreground">Locked</span>
                      ) : (
                        <Link
                          to="/requests/$requestId/edit"
                          params={{ requestId: r.id }}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Edit
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-10 flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Stripe payment links</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Live status of every payment link request. Refreshes automatically; sync pulls the
              current state straight from Stripe.
            </p>
          </div>
          <Link
            to="/payment-links"
            className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent transition"
          >
            + New payment link
          </Link>
        </div>

        <div className="bg-background border rounded-2xl overflow-hidden">
          {links.isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(2)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : links.error ? (
            <div className="py-10 text-center text-sm text-destructive">
              {links.error instanceof Error
                ? links.error.message
                : "Could not load Stripe payment links"}
            </div>
          ) : !linkRows.length ? (
            <div className="py-20 text-center">
              <p className="text-sm text-muted-foreground">No payment links requested yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium">Product</th>
                    <th className="text-left px-5 py-3 font-medium">Payable</th>
                    <th className="text-left px-5 py-3 font-medium">Promo</th>
                    <th className="text-left px-5 py-3 font-medium">Status</th>
                    <th className="text-left px-5 py-3 font-medium">Collected</th>
                    <th className="text-right px-5 py-3 font-medium">Created</th>
                    <th className="text-right px-5 py-3 font-medium">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {linkRows.map((link) => (
                    <tr key={link.id} className="border-t hover:bg-muted/30 transition">
                      <td className="px-5 py-3">
                        <div className="font-medium">{link.product_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {link.customer_email || link.purpose || "No customer note"}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="tabular-nums">
                          {formatMoney(link.pricing.total, link.pricing.currency)}
                        </div>
                        {link.pricing.discountAmount > 0 && (
                          <div className="text-xs text-muted-foreground line-through tabular-nums">
                            {formatMoney(link.pricing.subtotal, link.pricing.currency)}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {link.promotionLabel ? (
                          <>
                            <div className="font-mono text-xs">
                              {link.promotionCode || link.promotion_code_id}
                            </div>
                            {link.promotionDiscountLabel && (
                              <div className="text-xs text-emerald-700">
                                {link.promotionDiscountLabel}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <PaymentLinkStatusBadge status={link.status} />
                        {link.isExpired && (
                          <div className="mt-1 text-xs text-amber-700">Past expiry</div>
                        )}
                        {link.error_message && (
                          <div
                            className="text-xs text-destructive mt-1 max-w-[220px] truncate"
                            title={link.error_message}
                          >
                            {link.error_message}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {formatMoney(link.total_paid_amount ?? 0, link.pricing.currency)}
                        <span className="ml-2 text-xs">({link.payment_count ?? 0})</span>
                      </td>
                      <td className="px-5 py-3 text-right text-muted-foreground text-xs">
                        {new Date(link.created_at).toLocaleString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          {link.stripe_payment_link_url && (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                title="Copy link"
                                onClick={() => {
                                  navigator.clipboard.writeText(link.stripe_payment_link_url ?? "");
                                  toast.success("Payment link copied");
                                }}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button type="button" size="sm" variant="outline" asChild>
                                <a
                                  href={link.stripe_payment_link_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="Open link"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            </>
                          )}
                          {link.stripe_payment_link_id && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              title="Sync status from Stripe"
                              disabled={syncMutation.isPending}
                              onClick={() => syncMutation.mutate(link.id)}
                            >
                              <RefreshCw
                                className={cn(
                                  "h-4 w-4",
                                  syncMutation.isPending &&
                                    syncMutation.variables === link.id &&
                                    "animate-spin",
                                )}
                              />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function PaymentLinkStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "Pending", className: "bg-amber-100 text-amber-800 border-amber-200" },
    approved: {
      label: "Approved",
      className: "bg-emerald-100 text-emerald-800 border-emerald-200",
    },
    rejected: { label: "Rejected", className: "bg-slate-100 text-slate-700 border-slate-200" },
    created: { label: "Active", className: "bg-blue-100 text-blue-800 border-blue-200" },
    paid: { label: "Paid", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    inactive: { label: "Inactive", className: "bg-slate-100 text-slate-700 border-slate-200" },
    failed: { label: "Failed", className: "bg-red-100 text-red-800 border-red-200" },
  };
  const s = map[status] ?? map.pending;
  return (
    <Badge variant="outline" className={s.className}>
      {s.label}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "Pending", className: "bg-amber-100 text-amber-800 border-amber-200" },
    approved: {
      label: "Approved",
      className: "bg-emerald-100 text-emerald-800 border-emerald-200",
    },
    rejected: { label: "Rejected", className: "bg-slate-100 text-slate-700 border-slate-200" },
    failed: { label: "Failed", className: "bg-red-100 text-red-800 border-red-200" },
  };
  const s = map[status] ?? map.pending;
  return (
    <Badge variant="outline" className={s.className}>
      {s.label}
    </Badge>
  );
}
