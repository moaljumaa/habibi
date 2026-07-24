// pages/login.tsx — sign in and sign up live on one page, toggled client-side. Signup is
// gated by HABIBI_SIGNUP_SECRET (see pages/api/auth/signup.ts) rather than "first run" — it's
// always reachable, for anyone who knows the secret.
import { useState } from "react";
import { useRouter } from "next/router";
import Image from "next/image";
import { Button, Field, Input, Notice } from "@/components/ui";

type Mode = "signin" | "signup";

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [secret, setSecret] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setErr("");
    setPassword("");
    setConfirm("");
    setSecret("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup" && password !== confirm) {
      return setErr("Passwords don't match.");
    }
    setBusy(true);
    setErr("");

    const url = mode === "signin" ? "/api/auth/login" : "/api/auth/signup";
    const body =
      mode === "signin" ? { email, password } : { email, password, secret };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      return setErr(data?.error ?? "Something went wrong. Try again.");
    }
    router.push("/");
  }

  const canSubmit =
    !busy && email && password && (mode === "signin" || (confirm && secret));

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Branding panel — hidden on small screens */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-panel p-12 lg:flex">
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-accent/20 blur-[120px]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-accent/10 blur-[120px]" />

        <div className="relative z-10 flex items-center gap-2">
          <Image src="/logo.png" alt="Habibi" width={28} height={28} className="rounded-md" />
          <span className="text-base font-semibold tracking-tight">Habibi</span>
        </div>

        <div className="relative z-10 max-w-sm">
          <h2 className="text-2xl font-semibold leading-snug text-ink">
            Know where you stand in AI answers.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Track which of your pages get cited by ChatGPT, Perplexity, and Gemini — self-hosted,
            honest about what it does, cheap to run.
          </p>
        </div>

        <div className="relative z-10 text-xs text-faint">© {new Date().getFullYear()} Habibi</div>
      </div>

      {/* Form column */}
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <Image src="/logo.png" alt="Habibi" width={40} height={40} className="rounded-md" />
          </div>

          <div className="mb-6">
            <h1 className="text-xl font-medium text-ink">
              {mode === "signin" ? "Sign in" : "Create an account"}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {mode === "signin"
                ? "Welcome back."
                : "You'll need the signup secret to join this instance."}
            </p>
          </div>

          <div className="space-y-3">
            <Field label="Email">
              <Input value={email} onChange={setEmail} placeholder="you@example.com" autoFocus />
            </Field>

            <Field label="Password" hint={mode === "signup" ? "At least 8 characters." : undefined}>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={setPassword}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-faint transition-colors hover:text-ink"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </Field>

            {mode === "signup" && (
              <>
                <Field label="Confirm password">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={confirm}
                    onChange={setConfirm}
                    placeholder="••••••••"
                  />
                </Field>
                <Field label="Signup secret" hint="Ask whoever runs this instance for it.">
                  <Input type="password" value={secret} onChange={setSecret} placeholder="••••••••" />
                </Field>
              </>
            )}

            {err && <Notice tone="danger">{err}</Notice>}

            <Button type="submit" variant="primary" disabled={!canSubmit}>
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </div>

          <div className="mt-6 border-t border-line pt-4 text-center">
            <button
              type="button"
              onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
              className="text-sm text-muted transition-colors hover:text-ink"
            >
              {mode === "signin"
                ? "Don't have an account? Sign up"
                : "Already have an account? Sign in"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
