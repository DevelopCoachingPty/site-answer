import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { MobileNav } from "@/components/mobile-nav";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/calls", label: "Calls" },
  { href: "/dashboard/payment-chase", label: "Payment Chasing" },
  { href: "/dashboard/knowledge-base", label: "Knowledge Base" },
  { href: "/dashboard/scripts", label: "Scripts" },
  { href: "/dashboard/analytics", label: "Analytics" },
  { href: "/dashboard/whatsapp", label: "WhatsApp" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[var(--muted)]">
      {/* Top navigation */}
      <header className="relative border-b border-[var(--border)] bg-[var(--background)]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-4 md:gap-8">
            <MobileNav items={navItems} />
            <Link href="/dashboard" className="text-xl font-bold">
              SiteAnswer
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)] transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline text-sm text-[var(--muted-foreground)]">
              {user.email}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
