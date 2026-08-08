import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",          // Preload route code & data on hover/intent for instant navigation
    defaultPreloadDelay: 50,          // 50ms hover delay threshold
    defaultPreloadStaleTime: 5 * 60 * 1000, // 5 min cache for preloaded routes
    defaultPendingMs: 0,              // Render immediately without artificial delay
    defaultGcTime: 10 * 60 * 1000,    // Retain routes in memory for 10 min
  });

  return router;
};
