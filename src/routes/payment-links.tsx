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
  searchMomenceMembers,
  setStripePaymentLinkActive,
  updateStripePaymentLinkRequest,
} from "@/lib/stripe-payment-links.functions";
import { ASSOCIATES, PAYMENT_LINK_PURPOSES } from "@/data/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
type LineItem = { priceId: string; quantity: string };
type CustomField = { key: string; label: string; type: "text" | "numeric"; optional: boolean };
type MomenceMember = { id: string; name: string; email: string; phone: string; raw: unknown };

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
  const memberSearchFn = useServerFn(searchMomenceMembers);

  const catalog = useQuery({
    queryKey: ["stripe-catalog"],
    queryFn: () => catalogFn(),
  });
  const links = useQuery({
    queryKey: ["stripe-payment-links"],
    queryFn: () => linksFn(),
    refetchInterval: 8000,
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([{ priceId: "", quantity: "1" }]);
  const [allowPromoCodes, setAllowPromoCodes] = useState(false);
  const [promoMode, setPromoMode] = useState<PromoMode>("none");
  const [promotionCodeId, setPromotionCodeId] = useState("");
  const [customPromoCode, setCustomPromoCode] = useState("");
  const [customPromoType, setCustomPromoType] = useState<CustomPromoType>("percentage");
  const [customPromoValue, setCustomPromoValue] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState<MomenceMember | null>(null);
  const [description, setDescription] = useState("");
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [utm, setUtm] = useState({
    source: "",
    medium: "",
    campaign: "",
    term: "",
    content: "",
  });
  const [purpose, setPurpose] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const memberSearch = useQuery({
    queryKey: ["momence-members", memberQuery],
    queryFn: () => memberSearchFn({ data: { query: memberQuery } }),
    enabled: memberQuery.trim().length >= 2,
  });

  const selectedProducts = useMemo(
    () =>
      lineItems
        .map((item) => {
          const product = catalog.data?.products.find((p) => p.priceId === item.priceId);
          if (!product) return null;
          return { ...product, quantity: Number(item.quantity || 1) };
        })
        .filter(Boolean),
    [catalog.data?.products, lineItems],
  );

  const createMutation = useMutation({
    mutationFn: () =>
      (editingId ? updateFn : createFn)({
        data: {
          ...(editingId ? { id: editingId } : {}),
          lineItems: lineItems.map((item) => ({
            priceId: item.priceId,
            quantity: Number(item.quantity),
          })),
          promoMode: allowPromoCodes ? promoMode : "none",
          promotionCodeId: allowPromoCodes && promoMode === "existing" ? promotionCodeId : null,
          customPromoCode: allowPromoCodes && promoMode === "custom" ? customPromoCode : null,
          customPromoType: allowPromoCodes && promoMode === "custom" ? customPromoType : null,
          customPromoValue:
            allowPromoCodes && promoMode === "custom" ? Number(customPromoValue) : null,
          customerEmail: customerEmail || null,
          customerName: customerName || null,
          momenceMemberId: selectedMember?.id ?? null,
          momenceMemberDetails: selectedMember?.raw ?? null,
          description: description || null,
          customFields,
          utm,
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
    if (lineItems.some((item) => !item.priceId)) return toast.error("Select every Stripe product");
    if (lineItems.some((item) => !item.quantity || Number(item.quantity) < 1)) {
      return toast.error("Enter valid quantities");
    }
    if (allowPromoCodes && promoMode === "existing" && !promotionCodeId) {
      return toast.error("Select a promo code");
    }
    if (allowPromoCodes && promoMode === "custom" && !customPromoCode.trim()) {
      return toast.error("Enter a custom promo code");
    }
    if (
      allowPromoCodes &&
      promoMode === "custom" &&
      (!customPromoValue || Number(customPromoValue) <= 0)
    ) {
      return toast.error("Enter a valid custom promo value");
    }
    createMutation.mutate();
  }

  function editLink(link: PaymentLinkRow) {
    setEditingId(link.id);
    const existingItems = Array.isArray(link.line_items)
      ? (link.line_items as Array<{ priceId?: string; quantity?: number }>)
      : [];
    setLineItems(
      existingItems.length
        ? existingItems.map((item) => ({
            priceId: item.priceId ?? "",
            quantity: String(item.quantity ?? 1),
          }))
        : [{ priceId: link.stripe_price_id, quantity: String(link.quantity) }],
    );
    if (link.promotion_code_id) {
      setAllowPromoCodes(true);
      setPromoMode("existing");
      setPromotionCodeId(link.promotion_code_id);
      setCustomPromoCode("");
    } else if (link.promotion_code) {
      setAllowPromoCodes(true);
      setPromoMode("custom");
      setPromotionCodeId("");
      setCustomPromoCode(link.promotion_code);
      setCustomPromoType(link.custom_promo_type === "fixed" ? "fixed" : "percentage");
      setCustomPromoValue(link.custom_promo_value ? String(link.custom_promo_value) : "");
    } else {
      setAllowPromoCodes(false);
      setPromoMode("none");
      setPromotionCodeId("");
      setCustomPromoCode("");
    }
    setCustomerEmail(link.customer_email ?? "");
    setCustomerName(link.customer_name ?? "");
    setSelectedMember(
      link.momence_member_id
        ? {
            id: link.momence_member_id,
            name: link.customer_name ?? "Momence member",
            email: link.customer_email ?? "",
            phone: "",
            raw: link.momence_member_details,
          }
        : null,
    );
    setDescription(link.description ?? "");
    setCustomFields(Array.isArray(link.custom_fields) ? (link.custom_fields as CustomField[]) : []);
    const savedUtm =
      link.utm_parameters && typeof link.utm_parameters === "object"
        ? (link.utm_parameters as Partial<typeof utm>)
        : {};
    setUtm({
      source: savedUtm.source ?? "",
      medium: savedUtm.medium ?? "",
      campaign: savedUtm.campaign ?? "",
      term: savedUtm.term ?? "",
      content: savedUtm.content ?? "",
    });
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

          <div className="space-y-3">
            <Label className="block text-sm font-medium">Stripe products</Label>
            {catalog.error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {catalog.error instanceof Error
                  ? catalog.error.message
                  : "Could not load Stripe products"}
              </div>
            )}
            {catalog.data?.promoLoadError && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Products loaded, but promo codes could not be loaded: {catalog.data.promoLoadError}
              </div>
            )}
            {lineItems.map((item, index) => (
              <div key={index} className="grid gap-3 md:grid-cols-[1fr_120px_80px]">
                <Select
                  value={item.priceId}
                  onValueChange={(value) =>
                    setLineItems((items) =>
                      items.map((next, i) => (i === index ? { ...next, priceId: value } : next)),
                    )
                  }
                >
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
                <Input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) =>
                    setLineItems((items) =>
                      items.map((next, i) =>
                        i === index ? { ...next, quantity: e.target.value } : next,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={lineItems.length === 1}
                  onClick={() => setLineItems((items) => items.filter((_, i) => i !== index))}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => setLineItems((items) => [...items, { priceId: "", quantity: "1" }])}
            >
              Add product
            </Button>
          </div>

          {selectedProducts.length > 0 && (
            <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              Link amount before discount:{" "}
              <span className="font-medium text-foreground">
                {formatMoney(
                  selectedProducts.reduce(
                    (sum, product) => sum + (product?.unitAmount ?? 0) * (product?.quantity ?? 1),
                    0,
                  ),
                  selectedProducts[0]?.currency ?? "inr",
                )}
              </span>
            </div>
          )}

          <div className="space-y-4">
            <label className="flex items-center gap-3 text-sm font-medium">
              <Checkbox
                checked={allowPromoCodes}
                onCheckedChange={(checked) => {
                  setAllowPromoCodes(Boolean(checked));
                  if (!checked) {
                    setPromoMode("none");
                    setPromotionCodeId("");
                    setCustomPromoCode("");
                  } else {
                    setPromoMode("existing");
                  }
                }}
              />
              Allow promo codes
            </label>

            {allowPromoCodes && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={promoMode === "existing" ? "default" : "outline"}
                    onClick={() => setPromoMode("existing")}
                  >
                    Use existing promo code
                  </Button>
                  <Button
                    type="button"
                    variant={promoMode === "custom" ? "default" : "outline"}
                    onClick={() => {
                      setPromoMode("custom");
                      setPromotionCodeId("");
                    }}
                  >
                    Create new promo code
                  </Button>
                </div>

                {promoMode === "existing" && (
                  <div className="grid gap-6 md:grid-cols-2">
                    <Field label="Existing Stripe promo code">
                      <Select value={promotionCodeId} onValueChange={setPromotionCodeId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select promo code" />
                        </SelectTrigger>
                        <SelectContent>
                          {catalog.data?.promotionCodes.length ? (
                            catalog.data.promotionCodes.map((code) => (
                              <SelectItem key={code.id} value={code.id}>
                                {code.label}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="__none" disabled>
                              No active promo codes found
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                )}
              </div>
            )}
            {allowPromoCodes && promoMode === "custom" && (
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
          </div>

          <div className="space-y-3">
            <Field label="Momence member">
              <Input
                value={memberQuery}
                onChange={(e) => setMemberQuery(e.target.value)}
                placeholder="Search Momence members by name, email, or phone"
              />
            </Field>
            {memberSearch.error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {memberSearch.error instanceof Error
                  ? memberSearch.error.message
                  : "Could not load Momence members"}
              </div>
            )}
            {memberSearch.data?.members.length ? (
              <div className="rounded-lg border overflow-hidden">
                {(memberSearch.data.members as MomenceMember[]).map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => {
                      setSelectedMember(member);
                      setCustomerName(member.name);
                      setCustomerEmail(member.email);
                      setMemberQuery(member.name);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="font-medium">{member.name}</span>
                    <span className="ml-2 text-muted-foreground">
                      {[member.email, member.phone].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            {selectedMember && (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                Selected: {selectedMember.name}
                {selectedMember.email ? ` · ${selectedMember.email}` : ""}
              </div>
            )}
          </div>

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

          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Purpose">
              <Select value={purpose} onValueChange={setPurpose}>
                <SelectTrigger>
                  <SelectValue placeholder="Select purpose" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_LINK_PURPOSES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Created by">
              <Select value={createdBy} onValueChange={setCreatedBy}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  {ASSOCIATES.map((associate) => (
                    <SelectItem key={associate} value={associate}>
                      {associate}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Description / payment details">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Details shown internally for approval, handoff, or reconciliation..."
              rows={3}
            />
          </Field>

          <div className="space-y-3">
            <Label className="block text-sm font-medium">Stripe custom fields</Label>
            {customFields.map((field, index) => (
              <div key={index} className="grid gap-3 md:grid-cols-[1fr_1fr_130px_90px]">
                <Input
                  value={field.key}
                  onChange={(e) =>
                    setCustomFields((fields) =>
                      fields.map((next, i) =>
                        i === index ? { ...next, key: e.target.value } : next,
                      ),
                    )
                  }
                  placeholder="field_key"
                />
                <Input
                  value={field.label}
                  onChange={(e) =>
                    setCustomFields((fields) =>
                      fields.map((next, i) =>
                        i === index ? { ...next, label: e.target.value } : next,
                      ),
                    )
                  }
                  placeholder="Field label"
                />
                <Select
                  value={field.type}
                  onValueChange={(value) =>
                    setCustomFields((fields) =>
                      fields.map((next, i) =>
                        i === index ? { ...next, type: value as "text" | "numeric" } : next,
                      ),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="numeric">Number</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCustomFields((fields) => fields.filter((_, i) => i !== index))}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={customFields.length >= 3}
              onClick={() =>
                setCustomFields((fields) => [
                  ...fields,
                  { key: "", label: "", type: "text", optional: true },
                ])
              }
            >
              Add custom field
            </Button>
          </div>

          <div className="grid gap-6 md:grid-cols-5">
            {(["source", "medium", "campaign", "term", "content"] as const).map((key) => (
              <Field key={key} label={`UTM ${key}`}>
                <Input
                  value={utm[key]}
                  onChange={(e) => setUtm((next) => ({ ...next, [key]: e.target.value }))}
                  placeholder={key}
                />
              </Field>
            ))}
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
