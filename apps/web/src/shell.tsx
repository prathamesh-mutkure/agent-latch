import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useApprovals, useHealth } from "./hooks";
import { shortWallet } from "./model";
import { SignInPage } from "./pages/sign-in";
import { clearSession, useSession } from "./session";
import { insideWorldApp } from "./world";

const links = [
  { to: "/", label: "Overview", exact: true },
  { to: "/agents", label: "Agents", exact: false },
  { to: "/policies", label: "Policies", exact: false },
  { to: "/activity", label: "Activity", exact: false },
  { to: "/approvals", label: "Approvals", exact: false },
  { to: "/payments", label: "Payments", exact: false },
  { to: "/mini", label: "World App", exact: true },
] as const;

export function Shell() {
  return insideWorldApp ? <WorldAppShell /> : <ConsoleShell />;
}

function WorldAppShell() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <main className="mx-auto w-full max-w-xl px-5 py-6">
        <Outlet />
      </main>
    </div>
  );
}

function ConsoleShell() {
  const session = useSession();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const health = useHealth();
  const approvals = useApprovals();
  const pending =
    approvals.data?.filter((approval) => approval.status === "PENDING")
      .length ?? 0;
  const apiUp = health.data?.ok === true && health.data.database === "up";
  // A pushed approval link opens without a session. Deciding still needs World App.
  const open = pathname.startsWith("/approve/");

  return (
    <div className="min-h-screen bg-paper text-ink md:grid md:grid-cols-[220px_1fr]">
      <aside className="flex flex-col border-b border-line bg-ink text-paper md:min-h-screen md:border-r md:border-b-0">
        <div className="px-4 py-5">
          <Link to="/" className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt=""
              width={36}
              height={36}
              className="size-9 rounded-lg"
            />
            <span>
              <span className="block text-base font-semibold tracking-tight">
                DSAP
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-paper/60">
                Delegated Spend Authorization Protocol
              </span>
            </span>
          </Link>
        </div>
        {session ? (
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
        ) : null}
        <div className="mt-auto hidden px-6 pb-6 text-xs text-paper/50 md:block">
          {session ? (
            <div className="mb-3 grid gap-1">
              <span className="font-mono">{shortWallet(session.wallet)}</span>
              <button
                type="button"
                className="justify-self-start underline"
                onClick={clearSession}
              >
                Sign out
              </button>
            </div>
          ) : null}
          <p>Sepolia · {apiUp ? "API up" : "API unreachable"}</p>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-5xl px-6 py-8 md:px-10 md:py-10">
        {session || open ? <Outlet /> : <SignInPage />}
      </main>
    </div>
  );
}
