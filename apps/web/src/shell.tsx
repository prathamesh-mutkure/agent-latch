import { Link, Outlet } from "@tanstack/react-router";
import { useApprovals, useHealth } from "./hooks";

const links = [
  { to: "/", label: "Overview", exact: true },
  { to: "/agents", label: "Agents", exact: false },
  { to: "/policies", label: "Policies", exact: false },
  { to: "/activity", label: "Activity", exact: false },
  { to: "/approvals", label: "Approvals", exact: false },
  { to: "/payments", label: "Payments", exact: false },
] as const;

export function Shell() {
  const health = useHealth();
  const approvals = useApprovals();
  const pending =
    approvals.data?.filter((approval) => approval.status === "PENDING")
      .length ?? 0;
  const apiUp = health.data?.ok === true && health.data.database === "up";

  return (
    <div className="min-h-screen bg-paper text-ink md:grid md:grid-cols-[220px_1fr]">
      <aside className="border-b border-line bg-ink text-paper md:min-h-screen md:border-r md:border-b-0">
        <div className="px-4 py-5">
          <Link to="/" className="text-base font-semibold tracking-tight">
            AgentLatch
          </Link>
          <p className="mt-1 text-xs text-paper/60">Control plane</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-4 md:grid md:px-3">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              activeOptions={{ exact: link.exact }}
              className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap text-paper/70"
              activeProps={{ className: "bg-white/10 text-paper" }}
            >
              <span>{link.label}</span>
              {link.to === "/approvals" && pending > 0 ? (
                <span className="rounded-full bg-wait px-1.5 text-xs text-paper">
                  {pending}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
        <p className="hidden px-6 pb-6 text-xs text-paper/50 md:block">
          Sepolia · {apiUp ? "API up" : "API unreachable"}
        </p>
      </aside>
      <main className="mx-auto w-full max-w-5xl px-6 py-8 md:px-10 md:py-10">
        <Outlet />
      </main>
    </div>
  );
}
