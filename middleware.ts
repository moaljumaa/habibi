// middleware.ts — gate every page and API route behind login. Runs on the Node.js runtime
// (not Edge): lib/db.ts depends on better-sqlite3, a native addon Edge can't load, and both
// the first-run check and session verification need it directly, with no extra round-trip.
import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getSetting } from "@/lib/data";

const ONBOARDING_COMPLETE_KEY = "onboarding_complete_at";

// The wizard reuses several pre-existing endpoints instead of duplicating them (see
// pages/onboarding's steps): /api/brands (step 3 creates the self brand), /api/providers
// (step 4 saves selected engines), /api/vendor-models (step 4 lists the 4 engine cards),
// /api/prompts (step 5 saves accepted prompts). All must stay reachable before onboarding is
// complete, or the wizard can never finish.
const ONBOARDING_API_ALLOWLIST = [
  "/api/brands",
  "/api/providers",
  "/api/vendor-models",
  "/api/prompts",
];

export const config = {
  runtime: "nodejs",
  // Excludes Next internals, /login, its auth API, the onboarding wizard + its API, and any
  // file with an extension (favicons, logo.png, etc. under public/) — those are static assets
  // the login page itself must load while logged out, not gated content.
  matcher: ["/((?!_next/static|_next/image|login|api/auth/|onboarding|api/onboarding/|.*\\..*).*)"],
};

export function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const uid = verifySessionToken(token);
  if (!uid) {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Single-tenant: every account shares the same brand/prompts/providers, so onboarding is an
  // instance-level gate, not per-user. Once anyone finishes it, everyone sees the dashboard.
  const path = req.nextUrl.pathname;
  const isAllowlistedDuringOnboarding = ONBOARDING_API_ALLOWLIST.some((p) => path.startsWith(p));
  if (!isAllowlistedDuringOnboarding && !getSetting(ONBOARDING_COMPLETE_KEY)) {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "onboarding required" }, { status: 403 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/onboarding";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
