import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/router";
import { ReactNode, useState, useEffect, useCallback } from "react";
import SettingsModal from "./SettingsModal";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/prompts", label: "Prompts" },
  { href: "/citations", label: "Citations" },
];

export default function Layout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { pathname } = router;

  // Settings is a dialog, not a page — but ?settings=1 keeps it linkable and survives reload.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(router.query.settings === "1");
  }, [router.query.settings]);

  const [email, setEmail] = useState("");
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setEmail(d.email))
      .catch(() => {});
  }, []);

  const [version, setVersion] = useState("");
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState("");
  useEffect(() => {
    fetch("/api/system/update")
      .then((r) => r.json())
      .then((d) => {
        setVersion(d.current ?? "");
        if (d.updateAvailable) {
          setUpdateAvailable(true);
          setLatestVersion(d.latest);
        }
      })
      .catch(() => {});
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const openSettings = useCallback(() => {
    router.push({ pathname, query: { ...router.query, settings: "1" } }, undefined, {
      shallow: true,
    });
  }, [router, pathname]);

  const closeSettings = useCallback(() => {
    const { settings, ...rest } = router.query;
    router.push({ pathname, query: rest }, undefined, { shallow: true });
  }, [router, pathname]);

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-panel px-3 py-6">
        <div className="mb-8 flex items-center gap-2 px-3">
          <Image src="/logo.png" alt="" width={20} height={20} className="shrink-0" />
          <div>
            <div className="text-base font-semibold tracking-tight">Habibi</div>
            <div className="text-xs text-muted">AI visibility tracker</div>
          </div>
        </div>

        <nav className="space-y-0.5">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "block rounded-md px-3 py-1.5 text-sm transition-colors " +
                  (active
                    ? "bg-raised font-medium text-ink"
                    : "text-muted hover:bg-raised hover:text-ink")
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-0.5">
          <button
            onClick={openSettings}
            className="block w-full rounded-md px-3 py-1.5 text-left text-sm text-muted transition-colors hover:bg-raised hover:text-ink"
          >
            Settings
          </button>
          {email && (
            <div className="flex items-center justify-between gap-2 px-3 py-1.5">
              <span className="truncate text-xs text-faint" title={email}>
                {email}
              </span>
              <button
                onClick={logout}
                className="shrink-0 text-xs text-muted transition-colors hover:text-ink"
              >
                Log out
              </button>
            </div>
          )}
          {version && (
            <div className="px-3 py-1.5 text-xs text-faint">
              v{version}
              {updateAvailable && (
                <span className="ml-1.5 text-accent" title={`v${latestVersion} available`}>
                  · update available
                </span>
              )}
            </div>
          )}
        </div>
      </aside>

      <main className="max-w-5xl flex-1 px-8 py-8">{children}</main>

      {open && <SettingsModal onClose={closeSettings} />}
    </div>
  );
}
