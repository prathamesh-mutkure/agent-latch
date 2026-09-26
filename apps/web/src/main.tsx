import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  RouterProvider,
  redirect,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { ActivityPage } from "./pages/activity";
import { AgentPage } from "./pages/agent";
import { AgentsPage } from "./pages/agents";
import { ApprovalsPage } from "./pages/approvals";
import { ApprovePage } from "./pages/approve";
import { MiniPage } from "./pages/mini";
import { OverviewPage } from "./pages/overview";
import { PairPage } from "./pages/pair";
import { PaymentsPage } from "./pages/payments";
import { PoliciesPage } from "./pages/policies";
import { onSessionChange } from "./session";
import { Shell } from "./shell";
import { insideWorldApp, installWorldApp } from "./world";

installWorldApp();

/** The dashboard is for the computer. World App gets `/mini`, `/approve`, and `/pair`. */
function consoleOnly() {
  if (insideWorldApp) {
    throw redirect({ to: "/mini" });
  }
}

const rootRoute = createRootRoute({
  component: Shell,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: consoleOnly,
  component: OverviewPage,
});

const agentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agents",
  beforeLoad: consoleOnly,
  component: AgentsPage,
});

const agentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agents/$agentId",
  beforeLoad: consoleOnly,
  component: AgentPage,
});

const policiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/policies",
  beforeLoad: consoleOnly,
  component: PoliciesPage,
});

const activityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/activity",
  beforeLoad: consoleOnly,
  component: ActivityPage,
});

const approvalsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/approvals",
  beforeLoad: consoleOnly,
  component: ApprovalsPage,
});

const approveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/approve/$approvalId",
  component: ApprovePage,
});

const paymentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/payments",
  beforeLoad: consoleOnly,
  component: PaymentsPage,
});

const miniRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mini",
  component: MiniPage,
});

const pairRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pair/$code",
  component: PairPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  agentsRoute,
  agentRoute,
  policiesRoute,
  activityRoute,
  approvalsRoute,
  approveRoute,
  paymentsRoute,
  miniRoute,
  pairRoute,
]);

const router = createRouter({
  routeTree,
  defaultNotFoundComponent: function NotFound() {
    return (
      <div>
        <h1 className="text-3xl font-semibold">Page not found</h1>
        <Link to="/" className="mt-4 inline-block text-sm underline">
          Overview
        </Link>
      </div>
    );
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchIntervalInBackground: true,
      retry: 1,
    },
  },
});

// Cached reads belong to one owner. Drop them when someone signs in or out.
onSessionChange(() => {
  void queryClient.resetQueries();
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("root element missing");
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
