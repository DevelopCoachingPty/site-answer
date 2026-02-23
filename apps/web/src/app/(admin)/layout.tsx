import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { MobileNav } from "@/components/mobile-nav";

const adminNavItems = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/organisations", label: "Organisations" },
  { href: "/admin/usage", label: "Usage & Billing" },
  { href: "/admin/alerts", label: "Alerts" },
];

export default async function AdminLayout({
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

  // Check admin status from users table
  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-[var(--muted)]">
      <header className="relative border-b border-[var(--border)] bg-[var(--background)]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-4 md:gap-8">
            <MobileNav items={adminNavItems} />
            <Link href="/admin" className="text-xl font-bold">
              SiteAnswer <span className="text-sm font-normal text-[var(--muted-foreground)]">Admin</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {adminNavItems.map((item) => (
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
            <Link
              href="/dashboard"
              className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              Member View
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
