import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Operational freshness policy: 5 seconds staleTime avoids duplicate network requests
        // during rapid subroute navigation while ensuring operational data (orders, stock, tasks)
        // remains fresh and automatically updates on window refocus.
        staleTime: 5_000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: true,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
