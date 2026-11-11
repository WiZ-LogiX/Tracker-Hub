import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

const configuratorSearchSchema = z.object({
  customerId: z.string().optional(),
  opportunityId: z.string().optional(),
  rfq: z.string().optional(),
  quoteId: z.string().optional(),
});

export const Route = createFileRoute("/admin/quotes/configurator")({
  validateSearch: configuratorSearchSchema,
  beforeLoad: ({ search }) => {
    // The legacy configurator is permanently retired.
    // Seamlessly redirect any legacy/bookmarked URLs to the single supported commercial quotation builder.
    throw redirect({
      to: "/admin/quotes/new",
      search: {
        customerId: search.customerId,
        opportunityId: search.opportunityId,
        rfq: search.rfq,
        quoteId: search.quoteId,
      },
      replace: true,
    });
  },
  component: () => null,
});
