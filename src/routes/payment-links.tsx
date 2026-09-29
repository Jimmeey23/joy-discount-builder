import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  ExternalLink,
  Link as LinkIcon,
  PauseCircle,
  PlayCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  createStripePaymentLink,
  listStripeCatalog,
  listStripePaymentLinks,
  searchMomenceMembers,
  setStripePaymentLinkActive,
  syncStripePaymentLink,
  updateStripePaymentLinkRequest,
} from "@/lib/stripe-payment-links.functions";
import {
  describePromotion,
  formatMoney,
  summarisePricing,
  type PromotionSummary,
} from "@/lib/payment-link-pricing";
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
type PaymentLinkRow = Tables<"payment_link_requests">;
type PaymentLinkListRow = PaymentLinkRow & {
  pricing: { subtotal: number; discountAmount: number; total: number; currency: string };
  promotionCode: string;
  promotionLabel: string;
  promotionDiscountLabel: string;
  isExpired: boolean;
};
type LineItem = { priceId: string; quantity: string };
type CustomField = { key: string; label: string; type: "text" | "numeric"; optional: boolean };
type MomenceMember = { id: string; name: string; email: string; phone: string; raw: unknown };
type CatalogPromotion = PromotionSummary & { label: string };

export const Route = createFileRoute("/payment-links")({
  component: PaymentLinksPage,
  head: () => ({
    meta: [{ title: "Stripe payment links · Momence Approvals" }],
  }),
});

function Header() {
  return (
    <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-20">
      <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-2 block text-sm font-medium">{label}</Label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-background border rounded-2xl p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <Checkbox
        className="mt-0.5"
        aria-label={label}
        checked={checked}
        onCheckedChange={(value) => onChange(Boolean(value))}
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

function PaymentLinksPage() {
  const queryClient = useQueryClient();
  const catalogFn = useServerFn(listStripeCatalog);
  const linksFn = useServerFn(listStripePaymentLinks);
  const createFn = useServerFn(createStripePaymentLink);
  const updateFn = useServerFn(updateStripePaymentLinkRequest);
  const setActiveFn = useServerFn(setStripePaymentLinkActive);
  const syncFn = useServerFn(syncStripePaymentLink);
  const memberSearchFn = useServerFn(searchMomenceMembers);

  const catalog = useQuery({
    queryKey: ["stripe-catalog"],
    queryFn: () => catalogFn(),
  });
  const links = useQuery({
    queryKey: ["stripe-payment-links"],
    queryFn: () => linksFn(),
    refetchInterval: 5000,
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([{ priceId: "", quantity: "1" }]);
  const [allowPromoCodes, setAllowPromoCodes] = useState(false);
  const [promoMode, setPromoMode] = useState<PromoMode>("none");
  const [promotionCodeId, setPromotionCodeId] = useState("");
  const [customPromoCode, setCustomPromoCode] = useState("");
  const [customPromoType, setCustomPromoType] = useState<CustomPromoType>("percentage");
  const [customPromoValue, setCustomPromoValue] = useState("");
  const [allowCustomerPromoEntry, setAllowCustomerPromoEntry] = useState(false);
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState<MomenceMember | null>(null);
  const [description, setDescription] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [collectAddress, setCollectAddress] = useState(false);
  const [collectPhone, setCollectPhone] = useState(false);
  const [singleUse, setSingleUse] = useState(false);
  const [adjustableQuantity, setAdjustableQuantity] = useState(false);
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [linkExpiresAt, setLinkExpiresAt] = useState("");
  const [afterCompletionType, setAfterCompletionType] = useState<"redirect" | "message">(
    "redirect",
  );
  const [afterCompletionMessage, setAfterCompletionMessage] = useState("");
  const [afterCompletionRedirectUrl, setAfterCompletionRedirectUrl] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
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
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [catalog.data?.products, lineItems],
  );

  const selectedPromotion = useMemo(
    () =>
      (allowPromoCodes && promoMode === "existing"
        ? (catalog.data?.promotionCodes as CatalogPromotion[] | undefined)?.find(
            (code) => code.id === promotionCodeId,
          )
        : null) ?? null,
    [allowPromoCodes, promoMode, promotionCodeId, catalog.data?.promotionCodes],
  );

  const pricing = useMemo(
    () =>
      summarisePricing({
        items: selectedProducts.map((product) => ({
          unitAmount: product.unitAmount,
          quantity: product.quantity,
          currency: product.currency,
        })),
        promotion: selectedPromotion,
        customPromo:
          allowPromoCodes && promoMode === "custom"
            ? { type: customPromoType, value: Number(customPromoValue) || null }
            : null,
      }),
    [
      selectedProducts,
      selectedPromotion,
      allowPromoCodes,
      promoMode,
      customPromoType,
      customPromoValue,
    ],
  );

  function resetForm() {
    setEditingId(null);
    setLineItems([{ priceId: "", quantity: "1" }]);
    setAllowPromoCodes(false);
    setPromoMode("none");
    setPromotionCodeId("");
    setCustomPromoCode("");
    setCustomPromoValue("");
    setAllowCustomerPromoEntry(false);
    setCustomerEmail("");
    setCustomerName("");
    setCustomerPhone("");
    setMemberQuery("");
    setSelectedMember(null);
    setDescription("");
    setInternalNote("");
    setCustomFields([]);
    setCollectAddress(false);
    setCollectPhone(false);
    setSingleUse(false);
    setAdjustableQuantity(false);
    setMaxRedemptions("");
    setLinkExpiresAt("");
    setAfterCompletionType("redirect");
    setAfterCompletionMessage("");
    setAfterCompletionRedirectUrl("");
    setUtm({ source: "", medium: "", campaign: "", term: "", content: "" });
    setPurpose("");
    setCreatedBy("");
  }

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
          customerPhone: customerPhone || null,
          momenceMemberId: selectedMember?.id ?? null,
          momenceMemberDetails: selectedMember?.raw ?? null,
          description: description || null,
          internalNote: internalNote || null,
          customFields,
          utm,
          purpose: purpose || null,
          createdBy: createdBy || null,
          collectAddress,
          collectPhone,
          singleUse,
          adjustableQuantity,
          allowPromotionCodes: allowCustomerPromoEntry,
          maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
          linkExpiresAt: linkExpiresAt ? new Date(linkExpiresAt).toISOString() : null,
          afterCompletionType,
          afterCompletionMessage: afterCompletionMessage || null,
          afterCompletionRedirectUrl: afterCompletionRedirectUrl || null,
        },
      } as never),
    onSuccess: (res) => {
      const link = (res as { paymentLink?: PaymentLinkRow }).paymentLink;
      toast.success(editingId ? "Payment link request updated" : "Payment link request submitted", {
        description: link?.product_name
          ? `${link.product_name} is awaiting approval.`
          : "Approval request is ready.",
      });
      resetForm();
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
    if (
      allowPromoCodes &&
      promoMode === "custom" &&
      customPromoType === "percentage" &&
      Number(customPromoValue) > 100
    ) {
      return toast.error("Percentage discount cannot exceed 100");
    }
    if (afterCompletionType === "message" && !afterCompletionMessage.trim()) {
      return toast.error("Enter the confirmation message shown after payment");
    }
    if (afterCompletionType === "redirect" && afterCompletionRedirectUrl) {
      try {
        new URL(afterCompletionRedirectUrl);
      } catch {
        return toast.error("Enter a valid redirect URL");
      }
    }
    if (linkExpiresAt && new Date(linkExpiresAt).getTime() <= Date.now()) {
      return toast.error("Expiry must be in the future");
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
        : [{ priceId: link.stripe_price_id ?? "", quantity: String(link.quantity ?? 1) }],
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
    setAllowCustomerPromoEntry(Boolean(link.allow_promotion_codes));
    setCustomerEmail(link.customer_email ?? "");
    setCustomerName(link.customer_name ?? "");
    setCustomerPhone(link.customer_phone ?? "");
    setSelectedMember(
      link.momence_member_id
        ? {
            id: link.momence_member_id,
            name: link.customer_name ?? "Momence member",
            email: link.customer_email ?? "",
            phone: link.customer_phone ?? "",
            raw: link.momence_member_details,
          }
        : null,
    );
    setDescription(link.description ?? "");
    setInternalNote(link.internal_note ?? "");
    setCustomFields(Array.isArray(link.custom_fields) ? (link.custom_fields as CustomField[]) : []);
    setCollectAddress(Boolean(link.collect_address));
    setCollectPhone(Boolean(link.collect_phone));
    setSingleUse(Boolean(link.single_use));
    setAdjustableQuantity(Boolean(link.adjustable_quantity));
    setMaxRedemptions(link.max_redemptions ? String(link.max_redemptions) : "");
    setLinkExpiresAt(
      link.link_expires_at ? new Date(link.link_expires_at).toISOString().slice(0, 16) : "",
    );
    setAfterCompletionType(link.after_completion_type === "message" ? "message" : "redirect");
    setAfterCompletionMessage(link.after_completion_message ?? "");
    setAfterCompletionRedirectUrl(link.after_completion_redirect_url ?? "");
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
    setShowAdvanced(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const analytics = links.data?.analytics;
  const linkRows = (links.data?.links ?? []) as PaymentLinkListRow[];

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      <main className="mx-auto max-w-7xl px-6 py-10 space-y-8">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Stripe payment links</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Build a Stripe-hosted payment link, send it for approval, and track payments as Stripe
            reports them.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Metric label="Links" value={analytics?.totalLinks ?? 0} />
          <Metric label="Paid links" value={analytics?.paidLinks ?? 0} />
          <Metric label="Payments" value={analytics?.totalPayments ?? 0} />
          <Metric label="Revenue" value={formatMoney(analytics?.totalRevenue ?? 0, "inr")} />
        </div>

        <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5 text-primary" />
              <h3 className="text-base font-semibold">
                {editingId ? "Edit payment link request" : "Create payment link request"}
              </h3>
              {editingId && (
                <Button type="button" size="sm" variant="ghost" onClick={resetForm}>
                  Cancel edit
                </Button>
              )}
            </div>

            <Section
              title="Product & pricing"
              description="Active Stripe prices for the Mumbai studios."
            >
              {catalog.error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {catalog.error instanceof Error
                    ? catalog.error.message
                    : "Could not load Stripe products"}
                </div>
              )}
              {catalog.data?.promoLoadError && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Products loaded, but promo codes could not be loaded:{" "}
                  {catalog.data.promoLoadError}
                </div>
              )}
              <div className="space-y-3">
                {lineItems.map((item, index) => (
                  <div key={index} className="grid gap-3 md:grid-cols-[1fr_110px_90px]">
                    <Select
                      value={item.priceId}
                      onValueChange={(value) =>
                        setLineItems((items) =>
                          items.map((next, i) =>
                            i === index ? { ...next, priceId: value } : next,
                          ),
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
                  onClick={() =>
                    setLineItems((items) => [...items, { priceId: "", quantity: "1" }])
                  }
                >
                  Add product
                </Button>
              </div>
              <ToggleRow
                label="Let the customer change the quantity"
                hint="Shows a quantity stepper on the Stripe checkout page."
                checked={adjustableQuantity}
                onChange={setAdjustableQuantity}
              />
            </Section>

            <Section title="Discount" description="Apply a Stripe promo code or create a new one.">
              <ToggleRow
                label="Apply a discount to this link"
                checked={allowPromoCodes}
                onChange={(checked) => {
                  setAllowPromoCodes(checked);
                  if (!checked) {
                    setPromoMode("none");
                    setPromotionCodeId("");
                    setCustomPromoCode("");
                  } else {
                    setPromoMode("existing");
                  }
                }}
              />

              {allowPromoCodes && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={promoMode === "existing" ? "default" : "outline"}
                      onClick={() => setPromoMode("existing")}
                    >
                      Use existing promo code
                    </Button>
                    <Button
                      type="button"
                      size="sm"
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
                    <Field label="Existing Stripe promo code">
                      <Select value={promotionCodeId} onValueChange={setPromotionCodeId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select promo code" />
                        </SelectTrigger>
                        <SelectContent>
                          {catalog.data?.promotionCodes.length ? (
                            (catalog.data.promotionCodes as CatalogPromotion[]).map((code) => (
                              <SelectItem key={code.id} value={code.id}>
                                {describePromotion(code, { withRedemptions: true }).label}
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
                  )}

                  {promoMode === "custom" && (
                    <div className="grid gap-4 md:grid-cols-3">
                      <Field label="Promo code">
                        <Input
                          value={customPromoCode}
                          onChange={(e) => setCustomPromoCode(e.target.value.toUpperCase())}
                          placeholder="STAFF50"
                          className="font-mono uppercase"
                        />
                      </Field>
                      <Field label="Discount type">
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
                      <Field
                        label={customPromoType === "percentage" ? "Percent off" : "Rupees off"}
                      >
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
              )}

              <ToggleRow
                label="Let the customer enter their own promo code"
                hint={
                  allowPromoCodes && promoMode !== "none"
                    ? "Unavailable while a discount is preset on the link — Stripe allows only one."
                    : "Shows a promo code box on the Stripe checkout page."
                }
                checked={allowCustomerPromoEntry && promoMode === "none"}
                onChange={(checked) => setAllowCustomerPromoEntry(checked)}
              />
            </Section>

            <Section
              title="Customer"
              description="Look up a Momence member, or enter the details by hand."
            >
              <Field label="Momence member">
                <Input
                  value={memberQuery}
                  onChange={(e) => {
                    setMemberQuery(e.target.value);
                    setSelectedMember(null);
                  }}
                  placeholder="Search by name, email, or phone"
                />
              </Field>
              {memberQuery.trim().length > 0 && memberQuery.trim().length < 2 && (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  Type at least 2 characters to search Momence members.
                </div>
              )}
              {memberSearch.isFetching && (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  Searching Momence members...
                </div>
              )}
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
                        setCustomerPhone(member.phone);
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
              ) : memberQuery.trim().length >= 2 &&
                !memberSearch.isFetching &&
                !memberSearch.error ? (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  No Momence members matched this search.
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-3">
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
                <Field label="Customer phone">
                  <Input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="+91 98XXXXXXXX"
                  />
                </Field>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <ToggleRow
                  label="Collect billing address"
                  checked={collectAddress}
                  onChange={setCollectAddress}
                />
                <ToggleRow
                  label="Collect phone number"
                  checked={collectPhone}
                  onChange={setCollectPhone}
                />
              </div>
            </Section>

            <Section title="Link behaviour" description="How the link behaves once it is live.">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Expires at" hint="Left empty, the link stays live until paused.">
                  <Input
                    type="datetime-local"
                    value={linkExpiresAt}
                    onChange={(e) => setLinkExpiresAt(e.target.value)}
                  />
                </Field>
                <Field
                  label="Max completed payments"
                  hint="Stripe stops accepting payments after this many."
                >
                  <Input
                    type="number"
                    min="1"
                    value={maxRedemptions}
                    onChange={(e) => setMaxRedemptions(e.target.value)}
                    placeholder="Unlimited"
                  />
                </Field>
              </div>

              <ToggleRow
                label="Single use"
                hint="Closes the link after the first successful payment."
                checked={singleUse}
                onChange={setSingleUse}
              />

              <Field label="After payment">
                <Select
                  value={afterCompletionType}
                  onValueChange={(value) => setAfterCompletionType(value as "redirect" | "message")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="redirect">Redirect to a page</SelectItem>
                    <SelectItem value="message">Show a confirmation message</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {afterCompletionType === "redirect" ? (
                <Field label="Redirect URL" hint="Left empty, customers return to this dashboard.">
                  <Input
                    value={afterCompletionRedirectUrl}
                    onChange={(e) => setAfterCompletionRedirectUrl(e.target.value)}
                    placeholder="https://physique57india.com/thank-you"
                  />
                </Field>
              ) : (
                <Field label="Confirmation message">
                  <Textarea
                    value={afterCompletionMessage}
                    onChange={(e) => setAfterCompletionMessage(e.target.value)}
                    placeholder="Thank you! Our team will confirm your booking shortly."
                    rows={2}
                  />
                </Field>
              )}
            </Section>

            <Section title="Internal" description="Context for whoever approves and reconciles.">
              <div className="grid gap-4 md:grid-cols-2">
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

              <Field label="Internal note" hint="Included in the approval email.">
                <Textarea
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  placeholder="Anything the approver should know."
                  rows={2}
                />
              </Field>
            </Section>

            <section className="bg-background border rounded-2xl">
              <button
                type="button"
                onClick={() => setShowAdvanced((value) => !value)}
                className="flex w-full items-center justify-between px-6 py-4 text-left"
              >
                <span>
                  <span className="text-sm font-semibold tracking-tight">Advanced</span>
                  <span className="block text-xs text-muted-foreground">
                    Stripe custom fields and UTM tracking
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {showAdvanced ? "Hide" : "Show"}
                </span>
              </button>

              {showAdvanced && (
                <div className="space-y-5 border-t px-6 py-5">
                  <div className="space-y-3">
                    <Label className="block text-sm font-medium">Stripe custom fields</Label>
                    {customFields.map((field, index) => (
                      <div key={index} className="grid gap-3 md:grid-cols-[1fr_1fr_120px_90px]">
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
                          onClick={() =>
                            setCustomFields((fields) => fields.filter((_, i) => i !== index))
                          }
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

                  <div className="grid gap-4 md:grid-cols-5">
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
                </div>
              )}
            </section>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start space-y-4">
            <div className="bg-background border rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-semibold tracking-tight">Summary</h3>

              {selectedProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Select a product to see the amount the customer will pay.
                </p>
              ) : (
                <div className="space-y-3">
                  <ul className="space-y-2 text-sm">
                    {selectedProducts.map((product) => (
                      <li key={product.priceId} className="flex justify-between gap-3">
                        <span className="text-muted-foreground">
                          {product.name}
                          {product.quantity > 1 && ` × ${product.quantity}`}
                        </span>
                        <span className="tabular-nums">
                          {formatMoney(product.unitAmount * product.quantity, product.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="border-t pt-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="tabular-nums">
                        {formatMoney(pricing.subtotal, pricing.currency)}
                      </span>
                    </div>
                    {pricing.discountAmount > 0 && (
                      <div className="flex justify-between text-emerald-700">
                        <span>
                          Discount
                          {pricing.discountLabel && (
                            <span className="ml-1 text-xs">({pricing.discountLabel})</span>
                          )}
                        </span>
                        <span className="tabular-nums">
                          − {formatMoney(pricing.discountAmount, pricing.currency)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-2 text-base font-semibold">
                      <span>Payable</span>
                      <span className="tabular-nums">
                        {formatMoney(pricing.total, pricing.currency)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {selectedPromotion && (
                <div className="rounded-lg border bg-emerald-50/60 px-3 py-3 text-xs space-y-1">
                  <div className="font-mono text-sm font-semibold text-emerald-900">
                    {selectedPromotion.code}
                  </div>
                  <div className="text-emerald-900">
                    {describePromotion(selectedPromotion).discountLabel || "No discount on coupon"}
                  </div>
                  <div className="text-emerald-900/70">
                    {selectedPromotion.maxRedemptions
                      ? `${Math.max(
                          selectedPromotion.maxRedemptions - selectedPromotion.timesRedeemed,
                          0,
                        )} of ${selectedPromotion.maxRedemptions} redemptions left`
                      : `${selectedPromotion.timesRedeemed} redemptions used · unlimited`}
                  </div>
                  {selectedPromotion.expiresAt && (
                    <div className="text-emerald-900/70">
                      Promo expires{" "}
                      {new Date(selectedPromotion.expiresAt * 1000).toLocaleDateString("en-IN")}
                    </div>
                  )}
                  {!selectedPromotion.active && (
                    <div className="font-medium text-destructive">
                      This promo code is inactive in Stripe.
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-lg border bg-muted/30 px-3 py-3 text-xs space-y-1 text-muted-foreground">
                <div className="font-medium text-foreground">What the customer sees</div>
                <div>{customerEmail || customerName || "No customer prefilled"}</div>
                <div>
                  {[
                    collectAddress && "Billing address",
                    collectPhone && "Phone number",
                    allowCustomerPromoEntry && promoMode === "none" && "Promo code box",
                    adjustableQuantity && "Quantity stepper",
                    ...customFields.filter((f) => f.label).map((f) => f.label),
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Standard Stripe checkout"}
                </div>
                <div>
                  {afterCompletionType === "message"
                    ? "Then: confirmation message"
                    : "Then: redirect"}
                </div>
                {linkExpiresAt && (
                  <div>Expires {new Date(linkExpiresAt).toLocaleString("en-IN")}</div>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending
                  ? editingId
                    ? "Saving..."
                    : "Submitting..."
                  : editingId
                    ? "Save request"
                    : "Submit for approval"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Nothing is created in Stripe until the request is approved by email.
              </p>
            </div>
          </aside>
        </form>

        <div className="bg-background border rounded-2xl overflow-hidden">
          {links.isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !linkRows.length ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No Stripe payment links created yet.
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
                    <th className="text-right px-5 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {linkRows.map((link) => (
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
                        <StatusBadge status={link.status} />
                        {link.isExpired && (
                          <div className="mt-1 text-xs text-amber-700">Past expiry</div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {formatMoney(link.total_paid_amount ?? 0, link.pricing.currency)}
                        <span className="ml-2 text-xs">({link.payment_count ?? 0})</span>
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
                              title="Reactivate link"
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
                              title="Pause link"
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
