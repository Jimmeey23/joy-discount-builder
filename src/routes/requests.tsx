import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listDiscountRequests } from "@/lib/discount.functions";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

export const Route = createFileRoute("/requests")({
  component: RequestsPage,
  head: () => ({
    meta: [{ title: "Discount requests · Momence Approvals" }],
  }),
});

function RequestsPage() {
  const fn = useServerFn(listDiscountRequests);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["discount-requests"],
    queryFn: () => fn(),
    refetchInterval: 5000,
  });

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
                    <td className="px-5 py-3 font-mono font-medium">{r.code}</td>
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
      </main>
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
    failed: { label: "Failed", className: "bg-red-100 text-red-800 border-red-200" },
  };
  const s = map[status] ?? map.pending;
  return (
    <Badge variant="outline" className={s.className}>
      {s.label}
    </Badge>
  );
}
