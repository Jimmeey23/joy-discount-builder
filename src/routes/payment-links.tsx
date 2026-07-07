import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Link as LinkIcon, PauseCircle, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import {
  createStripePaymentLink,
  listStripeCatalog,
  listStripePaymentLinks,
  setStripePaymentLinkActive,
  updateStripePaymentLinkRequest,
} from "@/lib/stripe-payment-links.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type PromoMode = "none" | "existing" | "custom";
type CustomPromoType = "percentage" | "fixed";
type PaymentLinkRow = Tables<"stripe_payment_links">;

export const Route = createFileRoute("/payment-links")({
  component: PaymentLinksPage,
  head: () => ({
    meta: [{ title: "Stripe payment links · Momence Approvals" }],
  }),
});

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function Header() {
  return (
    <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
      <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
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
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-2 block text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}

function PaymentLinksPage() {
  const queryClient = useQueryClient();
  const catalogFn = useServerFn(listStripeCatalog);
  const linksFn = useServerFn(listStripePaymentLinks);
  const createFn = useServerFn(createStripePaymentLink);
  const updateFn = useServerFn(updateStripePaymentLinkRequest);
  const setActiveFn = useServerFn(setStripePaymentLinkActive);

  const catalog = useQuery({
    queryKey: ["stripe-catalog"],
    queryFn: () => catalogFn(),
  });
  const links = useQuery({
    queryKey: ["stripe-payment-links"],
    queryFn: () => linksFn(),
    refetchInterval: 8000,
  });

  const [priceId, setPriceId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [promoMode, setPromoMode] = useState<PromoMode>("none");
  const [promotionCodeId, setPromotionCodeId] = useState("");
  const [customPromoCode, setCustomPromoCode] = useState("");
  const [customPromoType, setCustomPromoType] = useState<CustomPromoType>("percentage");
  const [customPromoValue, setCustomPromoValue] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const selectedProduct = useMemo(
    () => catalog.data?.products.find((product) => product.priceId === priceId),
    [catalog.data?.products, priceId],
  );

  const createMutation = useMutation({
    mutationFn: () =>
      (editingId ? updateFn : createFn)({
        data: {
          ...(editingId ? { id: editingId } : {}),
          priceId,
          quantity: Number(quantity),
          promoMode,
          promotionCodeId: promoMode === "existing" ? promotionCodeId : null,
          customPromoCode: promoMode === "custom" ? customPromoCode : null,
          customPromoType: promoMode === "custom" ? customPromoType : null,
          customPromoValue: promoMode === "custom" ? Number(customPromoValue) : null,
          customerEmail: customerEmail || null,
          customerName: customerName || null,
          purpose: purpose || null,
          createdBy: createdBy || null,
        },
      } as never),
    onSuccess: (res) => {
      const link = (res as { paymentLink?: PaymentLinkRow }).paymentLink;
      toast.success(editingId ? "Payment link request updated" : "Payment link request submitted", {
        description: link?.product_name
          ? `${link.product_name} is awaiting approval.`
          : "Approval request is ready.",
      });
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["stripe-payment-links"] });
    },
    onError: (error) => {
      toast.error("Could not create payment link", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      setActiveFn({ data: { id, active } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stripe-payment-links"] });
    },
    onError: (error) => {
      toast.error("Could not update link status", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!priceId) return toast.error("Select a Stripe product");
    if (!quantity || Number(quantity) < 1) return toast.error("Enter a valid quantity");
    if (promoMode === "existing" && !promotionCodeId) return toast.error("Select a promo code");
    if (promoMode === "custom" && !customPromoCode.trim()) {
      return toast.error("Enter a custom promo code");
    }
    if (promoMode === "custom" && (!customPromoValue || Number(customPromoValue) <= 0)) {
      return toast.error("Enter a valid custom promo value");
    }
    createMutation.mutate();
  }

  function editLink(link: PaymentLinkRow) {
    setEditingId(link.id);
    setPriceId(link.stripe_price_id);
    setQuantity(String(link.quantity));
    if (link.promotion_code_id) {
      setPromoMode("existing");
      setPromotionCodeId(link.promotion_code_id);
      setCustomPromoCode("");
    } else if (link.promotion_code) {
      setPromoMode("custom");
      setPromotionCodeId("");
      setCustomPromoCode(link.promotion_code);
      setCustomPromoType(link.custom_promo_type === "fixed" ? "fixed" : "percentage");
      setCustomPromoValue(link.custom_promo_value ? String(link.custom_promo_value) : "");
    } else {
      setPromoMode("none");
      setPromotionCodeId("");
      setCustomPromoCode("");
    }
    setCustomerEmail(link.customer_email ?? "");
    setCustomerName(link.customer_name ?? "");
    setPurpose(link.purpose ?? "");
    setCreatedBy(link.created_by ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const analytics = links.data?.analytics;

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      <main className="mx-auto max-w-6xl px-6 py-10 space-y-8">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Stripe payment links</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Create Stripe-hosted payment links from active account products and track payment status
            from Stripe webhooks.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Metric label="Links" value={analytics?.totalLinks ?? 0} />
          <Metric label="Paid links" value={analytics?.paidLinks ?? 0} />
          <Metric label="Payments" value={analytics?.totalPayments ?? 0} />
          <Metric label="Revenue" value={formatMoney(analytics?.totalRevenue ?? 0, "inr")} />
        </div>

        <form onSubmit={submit} className="bg-background border rounded-2xl p-6 md:p-8 space-y-6">
          <div className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5 text-primary" />
            <h3 className="text-base font-semibold">
              {editingId ? "Edit payment link request" : "Create payment link request"}
            </h3>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Stripe product">
              <Select value={priceId} onValueChange={setPriceId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={catalog.isLoading ? "Loading products..." : "Select product"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {catalog.data?.products.map((product) => (
                    <SelectItem key={product.priceId} value={product.priceId}>
                      {product.name} · {product.displayAmount}
                      {product.recurring ? ` · ${product.recurring}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Quantity">
              <Input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>
          </div>

          {selectedProduct && (
            <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              Link amount before discount:{" "}
              <span className="font-medium text-foreground">
                {formatMoney(
                  selectedProduct.unitAmount * Number(quantity || 1),
                  selectedProduct.currency,
                )}
              </span>
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Promo code">
              <Select value={promoMode} onValueChange={(value) => setPromoMode(value as PromoMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No promo code</SelectItem>
                  <SelectItem value="existing">Use existing Stripe promo code</SelectItem>
                  <SelectItem value="custom">Create custom promo code</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {promoMode === "existing" && (
              <Field label="Existing Stripe promo code">
                <Select value={promotionCodeId} onValueChange={setPromotionCodeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select promo code" />
                  </SelectTrigger>
                  <SelectContent>
                    {catalog.data?.promotionCodes.map((code) => (
                      <SelectItem key={code.id} value={code.id}>
                        {code.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>

          {promoMode === "custom" && (
            <div className="grid gap-6 md:grid-cols-3">
              <Field label="Custom promo code">
                <Input
                  value={customPromoCode}
                  onChange={(e) => setCustomPromoCode(e.target.value.toUpperCase())}
                  placeholder="STAFF50"
                  className="font-mono uppercase"
                />
              </Field>
              <Field label="Custom promo type">
                <Select
                  value={customPromoType}
                  onValueChange={(value) => setCustomPromoType(value as CustomPromoType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage off</SelectItem>
                    <SelectItem value="fixed">Fixed amount off</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Custom promo value">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={customPromoValue}
                  onChange={(e) => setCustomPromoValue(e.target.value)}
                  placeholder={customPromoType === "percentage" ? "50" : "500"}
                />
              </Field>
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Customer email">
              <Input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="member@example.com"
              />
            </Field>
            <Field label="Customer name">
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Member name"
              />
            </Field>
          </div>

          <Field label="Purpose / internal note">
            <Textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="What this link is for, campaign context, or member details..."
              rows={3}
            />
          </Field>

          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Created by">
              <Input
                value={createdBy}
                onChange={(e) => setCreatedBy(e.target.value)}
                placeholder="Team member name"
              />
            </Field>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending
                ? editingId
                  ? "Saving..."
                  : "Submitting..."
                : editingId
                  ? "Save request"
                  : "Submit for approval"}
            </Button>
          </div>
        </form>

        <div className="bg-background border rounded-2xl overflow-hidden">
          {links.isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !links.data?.links.length ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No Stripe payment links created yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium">Product</th>
                    <th className="text-left px-5 py-3 font-medium">Amount</th>
                    <th className="text-left px-5 py-3 font-medium">Promo</th>
                    <th className="text-left px-5 py-3 font-medium">Status</th>
                    <th className="text-left px-5 py-3 font-medium">Paid</th>
                    <th className="text-right px-5 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(links.data.links as PaymentLinkRow[]).map((link) => (
                    <tr key={link.id} className="border-t hover:bg-muted/30 transition">
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          disabled={Boolean(link.stripe_payment_link_id) || link.status === "paid"}
                          onClick={() => editLink(link)}
                          className="font-medium text-left disabled:cursor-default disabled:text-foreground text-primary hover:underline"
                        >
                          {link.product_name}
                        </button>
                        <div className="text-xs text-muted-foreground">
                          {link.customer_email || link.purpose || "No customer note"}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {formatMoney(link.requested_amount, link.currency)}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {link.promotion_code || link.promotion_code_id || "None"}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={link.status} />
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {formatMoney(link.total_paid_amount, link.currency)}
                        <span className="ml-2 text-xs">({link.payment_count})</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          {link.stripe_payment_link_url && (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
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
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            </>
                          )}
                          {!link.stripe_payment_link_url && link.status !== "paid" && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => editLink(link)}
                            >
                              Edit
                            </Button>
                          )}
                          {link.status === "inactive" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={statusMutation.isPending}
                              onClick={() => statusMutation.mutate({ id: link.id, active: true })}
                            >
                              <PlayCircle className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={
                                statusMutation.isPending ||
                                link.status === "paid" ||
                                link.status === "approved" ||
                                !link.stripe_payment_link_id
                              }
                              onClick={() => statusMutation.mutate({ id: link.id, active: false })}
                            >
                              <PauseCircle className="h-4 w-4" />
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

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-background border rounded-xl px-5 py-4">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
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
    created: { label: "Active", className: "bg-blue-100 text-blue-800 border-blue-200" },
    paid: { label: "Paid", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    inactive: { label: "Inactive", className: "bg-slate-100 text-slate-700 border-slate-200" },
    failed: { label: "Failed", className: "bg-red-100 text-red-800 border-red-200" },
  };
  const s = map[status] ?? map.created;
  return (
    <Badge variant="outline" className={cn(s.className)}>
      {s.label}
    </Badge>
  );
}
