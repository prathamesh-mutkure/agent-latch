import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-white text-zinc-950">
      <Outlet />
    </div>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: function HomePage() {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 px-6">
        <p className="text-sm font-medium tracking-wide text-zinc-500">
          AgentLatch
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950">
          Control plane for autonomous agents
        </h1>
        <p className="max-w-xl text-lg text-zinc-600">
          Repository scaffold. Product behavior starts in Phase 1.
        </p>
      </main>
    );
  },
});

const routeTree = rootRoute.addChildren([indexRoute]);
const router = createRouter({ routeTree });
const queryClient = new QueryClient();

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
