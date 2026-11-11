import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/catalog")({
  beforeLoad: () => {
    // Obsolete /admin/catalog module has been retired.
    // Unified management is now handled exclusively at /admin/inventory.
    throw redirect({ to: "/admin/inventory", replace: true });
  },
  component: () => null,
});
