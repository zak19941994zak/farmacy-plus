import { useEffect } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useRouterState,
  useNavigate,
} from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { Topbar } from "@/components/topbar";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";

const titleMap: Record<string, string> = {
  "/": "لوحة التحكم",
  "/pos": "نقطة البيع",
  "/inventory": "إدارة المخزون",
  "/customers": "العملاء",
  "/suppliers": "الموردين",
  "/invoices": "الفواتير",
  "/finance": "الحسابات والمالية",
  "/reports": "التقارير",
  "/settings": "الإعدادات",
};

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <h2 className="mt-4 text-xl font-semibold">الصفحة غير موجودة</h2>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            العودة للرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">حدث خطأ ما</h1>
        <p className="mt-2 text-sm text-muted-foreground">حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.</p>
        {import.meta.env.DEV && (
          <p className="mt-2 text-xs text-muted-foreground/70 font-mono break-all">{error.message}</p>
        )}
        <div className="mt-6">
          <button onClick={() => { router.invalidate(); reset(); }} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            إعادة المحاولة
          </button>
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
      { title: "نظام إدارة الصيدلية البيطرية والزراعية" },
      { name: "description", content: "نظام ERP متكامل لإدارة الصيدلية البيطرية والمبيدات الزراعية: مخزون، نقطة بيع، فواتير، عملاء، موردين، وتقارير." },
      { property: "og:title", content: "نظام إدارة الصيدلية البيطرية والزراعية" },
      { name: "twitter:title", content: "نظام إدارة الصيدلية البيطرية والزراعية" },
      { property: "og:description", content: "نظام ERP متكامل لإدارة الصيدلية البيطرية والمبيدات الزراعية: مخزون، نقطة بيع، فواتير، عملاء، موردين، وتقارير." },
      { name: "twitter:description", content: "نظام ERP متكامل لإدارة الصيدلية البيطرية والمبيدات الزراعية: مخزون، نقطة بيع، فواتير، عملاء، موردين، وتقارير." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/gwDwF2latqhjQcPXYLRfSOFwtbH3/social-images/social-1779630294840-1779281249529.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/gwDwF2latqhjQcPXYLRfSOFwtbH3/social-images/social-1779630294840-1779281249529.webp" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Toaster richColors position="top-center" dir="rtl" />
        <Scripts />
      </body>
    </html>
  );
}

function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated, loading } = useAuth();

  // Invalidate caches on auth change
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      queryClient.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [queryClient]);

  // Auth guard
  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated && pathname !== "/auth") {
      navigate({ to: "/auth" });
    } else if (isAuthenticated && pathname === "/auth") {
      navigate({ to: "/" });
    }
  }, [isAuthenticated, loading, pathname, navigate]);

  // Auth page renders standalone (no sidebar/topbar)
  if (pathname === "/auth") return <Outlet />;

  if (loading || !isAuthenticated) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const title = titleMap[pathname] ?? "لوحة التحكم";
  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} />
        <main className="flex-1 px-4 py-6 md:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}
