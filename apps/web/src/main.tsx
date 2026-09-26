import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  RouterProvider,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { ActivityPage } from "./pages/activity";
import { AgentPage } from "./pages/agent";
import { AgentsPage } from "./pages/agents";
import { ApprovalsPage } from "./pages/approvals";
import { ApprovePage } from "./pages/approve";
import { OverviewPage } from "./pages/overview";
import { PaymentsPage } from "./pages/payments";
import { PoliciesPage } from "./pages/policies";
import { Shell } from "./shell";

const rootRoute = createRootRoute({
  component: Shell,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: OverviewPage,
});

const agentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agents",
  component: AgentsPage,
});

const agentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agents/$agentId",
  component: AgentPage,
});

const policiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/policies",
  component: PoliciesPage,
});

const activityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/activity",
  component: ActivityPage,
});

const approvalsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/approvals",
  component: ApprovalsPage,
});

const approveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/approve/$approvalId",
  validateSearch: (search: Record<string, unknown>): { result?: string } => ({
    result: typeof search.result === "string" ? search.result : undefined,
  }),
  component: ApprovePage,
});

const paymentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/payments",
  component: PaymentsPage,
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
