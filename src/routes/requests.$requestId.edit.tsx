import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { DiscountForm } from "@/components/discount-form";
import { getDiscountRequest } from "@/lib/discount.functions";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/requests/$requestId/edit")({
  component: EditRequestPage,
  head: () => ({
    meta: [{ title: "Edit discount request · Momence Approvals" }],
  }),
});

function EditRequestPage() {
  const { requestId } = Route.useParams();
  const fn = useServerFn(getDiscountRequest);
  const { data, isLoading, error } = useQuery({
    queryKey: ["discount-request", requestId],
    queryFn: () => fn({ data: { id: requestId } }),
  });

  const request = (
    data as { request?: Parameters<typeof DiscountForm>[0]["initialRequest"] } | undefined
  )?.request;
  const isApproved = request?.status === "approved";

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-center justify-between">
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
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8">
          <Link
            to="/requests"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            ← Back to requests
          </Link>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">Edit discount request</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Submitted requests can be updated until they are approved and created in Momence.
          </p>
        </div>

        {isLoading ? (
          <div className="bg-background border rounded-2xl p-6 md:p-8 shadow-sm space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : error ? (
          <div className="bg-background border rounded-2xl p-8 text-sm text-destructive">
            {error instanceof Error ? error.message : "Could not load request"}
          </div>
        ) : isApproved ? (
          <div className="bg-background border rounded-2xl p-8">
            <h3 className="text-lg font-semibold">This request is already approved</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Approved discount requests cannot be edited because the discount code has already been
              created in Momence.
            </p>
          </div>
        ) : request ? (
          <DiscountForm initialRequest={request} />
        ) : null}
      </main>
    </div>
  );
}
