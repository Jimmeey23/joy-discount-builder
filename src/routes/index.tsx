import { createFileRoute, Link } from "@tanstack/react-router";
import { DiscountForm } from "@/components/discount-form";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Create discount code · Momence Approvals" },
      {
        name: "description",
        content:
          "Create Momence discount codes with a built-in approval workflow for Physique 57 India.",
      },
    ],
  }),
});

function Index() {
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
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8">
          <Link
            to="/requests"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            ← Back to requests
          </Link>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">Create new discount code</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Fill in the details below. Once submitted, an approval email is sent to the admin. The
            discount code is created in Momence only after approval.
          </p>
        </div>
        <DiscountForm />
      </main>
    </div>
  );
}
