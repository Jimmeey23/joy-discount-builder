import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { submitDiscountRequest } from "@/lib/discount.functions";
import { MEMBERSHIPS } from "@/data/memberships";
import { ASSOCIATES, LOCATIONS, DISCOUNT_REASONS } from "@/data/constants";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type DiscountType = "percentage" | "fixed";
type LimitType = "unlimited" | "limited";
type AppliesTo = "everything" | "specific";
const OTHER_REASON = "Other (see notes)";

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border bg-background p-1 gap-1 w-full">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition",
              active
                ? "bg-primary/10 text-primary border border-primary/30"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <Label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-2">
      {children}
      {hint && (
        <span
          title={hint}
          className="inline-flex w-4 h-4 items-center justify-center rounded-full border text-[10px] text-muted-foreground cursor-help"
        >
          ?
        </span>
      )}
    </Label>
  );
}

function MembershipPicker({
  selected,
  onChange,
}: {
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return MEMBERSHIPS;
    return MEMBERSHIPS.filter(
      (m) =>
        m.name.toLowerCase().includes(term) ||
        m.hostName.toLowerCase().includes(term) ||
        String(m.id).includes(term),
    );
  }, [q]);

  const selectedSet = new Set(selected);

  function toggle(id: number) {
    if (selectedSet.has(id)) onChange(selected.filter((s) => s !== id));
    else onChange([...selected, id]);
  }

  function selectedNames() {
    return MEMBERSHIPS.filter((m) => selectedSet.has(m.id))
      .slice(0, 3)
      .map((m) => m.name);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between border rounded-lg bg-background px-3 py-2 text-sm hover:border-primary/40 transition text-left"
      >
        <span className="truncate text-foreground">
          {selected.length === 0 ? (
            <span className="text-muted-foreground">Select memberships…</span>
          ) : (
            <>
              {selectedNames().join(", ")}
              {selected.length > 3 && (
                <span className="text-muted-foreground"> +{selected.length - 3} more</span>
              )}
            </>
          )}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {MEMBERSHIPS.filter((m) => selectedSet.has(m.id)).map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-1 rounded-md border border-primary/20"
            >
              {m.name}
              <button type="button" onClick={() => toggle(m.id)} className="hover:text-primary/70">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute z-20 mt-2 w-full bg-popover border rounded-lg shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              placeholder="Search memberships…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="flex-1 bg-transparent text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Done
            </button>
          </div>
          <div className="max-h-72 overflow-auto">
            {filtered.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No memberships match "{q}"
              </div>
            )}
            {filtered.map((m) => {
              const checked = selectedSet.has(m.id);
              return (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 text-sm text-left hover:bg-accent transition",
                    checked && "bg-primary/5",
                  )}
                >
                  <div
                    className={cn(
                      "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                      checked
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-muted-foreground/30",
                    )}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{m.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {m.hostName} · ID {m.id}
                      {m.price !== "0" && m.price !== "null" ? ` · ₹${m.price}` : ""}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="border-t px-3 py-2 flex items-center justify-between text-xs text-muted-foreground bg-muted/30">
            <span>{selected.length} selected</span>
            {selected.length > 0 && (
              <button type="button" onClick={() => onChange([])} className="hover:text-foreground">
                Clear all
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function DiscountForm() {
  const navigate = useNavigate();
  const submit = useServerFn(submitDiscountRequest);

  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("percentage");
  const [discountValue, setDiscountValue] = useState<string>("");
  const [usageLimitType, setUsageLimitType] = useState<LimitType>("unlimited");
  const [usageAmount, setUsageAmount] = useState<string>("");
  const [renewalLimitType, setRenewalLimitType] = useState<LimitType>("unlimited");
  const [renewalsCount, setRenewalsCount] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [appliesTo, setAppliesTo] = useState<AppliesTo>("everything");
  const [membershipIds, setMembershipIds] = useState<number[]>([]);
  const [associateName, setAssociateName] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [requestedBy, setRequestedBy] = useState<string>("");

  const mutation = useMutation({
    mutationFn: async () => {
      const membershipNames = MEMBERSHIPS.filter((m) => membershipIds.includes(m.id)).map(
        (m) => m.name,
      );

      const expiresIso = expiresAt ? new Date(expiresAt).toISOString() : null;

      return submit({
        data: {
          code: code.trim(),
          discountType,
          discountValue: Number(discountValue),
          usageLimitType,
          usageAmount: usageLimitType === "limited" && usageAmount ? Number(usageAmount) : null,
          renewalLimitType,
          renewalsCount:
            renewalLimitType === "limited" && renewalsCount ? Number(renewalsCount) : null,
          expiresAt: expiresIso,
          appliesTo,
          membershipIds: appliesTo === "specific" ? membershipIds : [],
          membershipNames: appliesTo === "specific" ? membershipNames : [],
          associateName,
          location,
          reason,
          notes: notes || null,
          description: description || null,
          requestedBy: requestedBy || null,
        },
      });
    },
    onSuccess: (res) => {
      if (res.emailSent === false) {
        toast.warning("Request saved, approval email not sent", {
          description: res.emailError
            ? `Code ${res.code}: ${res.emailError}`
            : `Code ${res.code} was saved, but email delivery failed.`,
        });
      } else {
        toast.success(`Request submitted`, {
          description: `Approval email sent for code ${res.code}.`,
        });
      }
      navigate({ to: "/requests" });
    },
    onError: (e: unknown) => {
      toast.error("Could not submit request", {
        description: e instanceof Error ? e.message : String(e),
      });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return toast.error("Please enter a discount code");
    if (!discountValue || Number(discountValue) <= 0)
      return toast.error("Please enter a discount value");
    if (discountType === "percentage" && Number(discountValue) > 100)
      return toast.error("Percentage cannot exceed 100");
    if (!expiresAt) return toast.error("Please select an expiration date");
    if (usageLimitType === "limited" && !usageAmount)
      return toast.error("Please specify usage limit");
    if (renewalLimitType === "limited" && !renewalsCount)
      return toast.error("Please specify renewal limit");
    if (appliesTo === "specific" && membershipIds.length === 0)
      return toast.error("Please select at least one membership");
    if (!associateName) return toast.error("Please select an associate");
    if (!location) return toast.error("Please select a location");
    if (!reason) return toast.error("Please select a reason");
    if (reason === OTHER_REASON && !notes.trim())
      return toast.error("Please add notes when reason is Other");
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-background border rounded-2xl p-6 md:p-8 shadow-sm space-y-6">
        <div>
          <FieldLabel>Discount code</FieldLabel>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="FREE20"
            className="font-mono uppercase"
            required
          />
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <FieldLabel hint="Percentage off the total or a fixed amount in ₹.">
              Discount type
            </FieldLabel>
            <Segmented
              value={discountType}
              onChange={setDiscountType}
              options={[
                { value: "percentage", label: "Percentage" },
                { value: "fixed", label: "Fixed value" },
              ]}
            />
          </div>
          <div>
            <FieldLabel>Discount value</FieldLabel>
            <div className="relative">
              <Input
                type="number"
                min="0"
                step={discountType === "percentage" ? "1" : "0.01"}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder="0"
                className="pr-10"
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {discountType === "percentage" ? "%" : "₹"}
              </span>
            </div>
          </div>
        </div>

        <div>
          <FieldLabel hint="How many total times the code can be redeemed across all customers.">
            Usage limit
          </FieldLabel>
          <div className="grid md:grid-cols-2 gap-3 items-start">
            <Segmented
              value={usageLimitType}
              onChange={setUsageLimitType}
              options={[
                { value: "unlimited", label: "Unlimited" },
                { value: "limited", label: "Limited" },
              ]}
            />
            {usageLimitType === "limited" && (
              <Input
                type="number"
                min="1"
                value={usageAmount}
                onChange={(e) => setUsageAmount(e.target.value)}
                placeholder="Max uses"
              />
            )}
          </div>
        </div>

        <div>
          <FieldLabel hint="For auto-renewing memberships: how many renewals the discount applies to.">
            Auto-renewing subscriptions limit
          </FieldLabel>
          <div className="grid md:grid-cols-2 gap-3 items-start">
            <Segmented
              value={renewalLimitType}
              onChange={setRenewalLimitType}
              options={[
                { value: "unlimited", label: "Unlimited" },
                { value: "limited", label: "Limited" },
              ]}
            />
            {renewalLimitType === "limited" && (
              <Input
                type="number"
                min="1"
                value={renewalsCount}
                onChange={(e) => setRenewalsCount(e.target.value)}
                placeholder="Number of renewals"
              />
            )}
          </div>
        </div>

        <div>
          <FieldLabel>Expiration</FieldLabel>
          <Input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            required
          />
        </div>

        <div>
          <FieldLabel hint="Apply to all products and memberships, or only to specific memberships.">
            Applies to
          </FieldLabel>
          <Segmented
            value={appliesTo}
            onChange={setAppliesTo}
            options={[
              { value: "everything", label: "Everything" },
              { value: "specific", label: "Specific memberships" },
            ]}
          />
          {appliesTo === "specific" && (
            <div className="mt-3">
              <MembershipPicker selected={membershipIds} onChange={setMembershipIds} />
            </div>
          )}
        </div>

        <div>
          <FieldLabel>Description of discount code (optional)</FieldLabel>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Discount for new members"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Stored in Momence as the discount description.
          </p>
        </div>
      </div>

      <div className="bg-background border rounded-2xl p-6 md:p-8 shadow-sm space-y-6">
        <div>
          <h3 className="text-base font-semibold">Approval details</h3>
          <p className="text-sm text-muted-foreground mt-1">
            These fields are used by the approver to evaluate the request.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <FieldLabel>Associate</FieldLabel>
            <Select value={associateName} onValueChange={setAssociateName}>
              <SelectTrigger aria-required="true">
                <SelectValue placeholder="Select associate" />
              </SelectTrigger>
              <SelectContent>
                {ASSOCIATES.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel>Location</FieldLabel>
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger>
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {LOCATIONS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <FieldLabel>Reason for discount</FieldLabel>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger aria-required="true">
              <SelectValue placeholder="Select a reason" />
            </SelectTrigger>
            <SelectContent>
              {DISCOUNT_REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <FieldLabel>
            Notes for approver{reason === OTHER_REASON ? " (required for Other)" : ""}
          </FieldLabel>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Context, customer details, special circumstances…"
            rows={3}
            required={reason === OTHER_REASON}
          />
        </div>

        <div>
          <FieldLabel>Requested by (optional)</FieldLabel>
          <Input
            value={requestedBy}
            onChange={(e) => setRequestedBy(e.target.value)}
            placeholder="Your name"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pb-12">
        <Button type="button" variant="ghost" onClick={() => navigate({ to: "/requests" })}>
          Discard
        </Button>
        <Button type="submit" disabled={mutation.isPending} className="min-w-[180px]">
          {mutation.isPending ? "Submitting…" : "Submit for approval"}
        </Button>
      </div>
    </form>
  );
}
