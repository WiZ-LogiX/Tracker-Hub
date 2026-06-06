import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/useAuth";
import { ThemeProvider } from "@/components/theme-provider";
import { LanguageProvider } from "@/components/language-provider";
import "@/i18n";
import { ClientThemeInit } from "@/components/client-theme-init";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold">{t("errors.notFoundTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("errors.notFoundDesc")}</p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            {t("errors.backHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">{t("errors.somethingWrong")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            {t("errors.retry")}
          </button>
          <a href="/" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent">{t("common.home")}</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "PeleCanon — نظام التسعير وعروض الأسعار" },
      { name: "description", content: "نظام تسعير وعروض أسعار وتتبع إنتاج لـ PeleCanon" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <ClientThemeInit />
            <Outlet />
            <Toaster position="top-center" richColors />
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}