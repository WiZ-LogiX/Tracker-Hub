import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // High-performance operational caching policy: 30 seconds staleTime
        // ensures warm navigation between related routes reuses valid cached data instantly
        // without flashing skeletons or repeating fetches, while gcTime retains cache in memory.
        staleTime: 30_000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
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
