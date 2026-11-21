import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ViewUrlInput = z.object({
  urls: z.array(z.string().min(1).max(2048)).min(1).max(50),
});

export interface SignedView {
  url: string;
  original: string;
}

export const getR2ViewUrls = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ViewUrlInput.parse(input))
  .handler(async ({ data }): Promise<{ views: SignedView[] }> => {
    const { getR2ViewUrlsServer } = await import("./r2-views.server");
    return getR2ViewUrlsServer(data.urls);
  });
