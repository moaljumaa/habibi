<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/logo.png">
    <img src="public/logo-dark.png" alt="Habibi" width="56">
  </picture>
</p>

<h1 align="center">Habibi</h1>
<p align="center">Open-source, self-hosted tracking for how your brand shows up in AI answers — a free alternative to Peec AI, Promptwatch, and MentionDesk.</p>

<p align="center">
  <a href="https://opsily.com/hosting/habibi?utm_source=github&utm_medium=readme&utm_campaign=habibi">
    <img src="public/deploy-with-opsily.svg" alt="Deploy with Opsily" height="36" />
  </a>
</p>

---

## Why

Everyone's asking the same thing in the AEO/GEO communities: *how do I track LLM citations
without paying $90–500/mo for tools that mostly run a cron job and an API call?* The paid
tools aren't magic — the core loop is:

**a set of prompts × a set of engines, run daily → parse who got mentioned and which URLs
got cited → store → show trends.**

This is that loop, open-sourced. Honest about what it does, cheap to run, yours to own.

---

## Features

- **Guided onboarding** — sign up, connect an OpenRouter key, and a wizard reads your website,
  drafts your brand profile with an AI agent, picks engines, and suggests a starter prompt set —
  no blank dashboard, no manual setup required before you see your first result.
- **Four recognizable engines, one key** — ChatGPT, Claude, Gemini, and Perplexity, all through a
  single OpenRouter key. Pick vendors, not model IDs; each resolves to that vendor's current
  flagship automatically (with a full 300+ model catalogue still available for power users).
- **Page-level citation mapping** — not just "we got mentioned" but *which URL got cited, for
  which prompt, on which engine.* The headline feature.
- **Non-determinism handled** — each prompt runs N times; you get a mention *rate*, not a
  misleading single sample.
- **Competitor share-of-voice** — who else shows up in the same answers.
- **Trends over time** — visibility shifts week to week; see it.
- **Cost guardrails** — see the estimated cost *before* you run, per-run and daily spend caps,
  projected monthly cost before you schedule anything.

**Honest note:** engines are reached through search-grounded **APIs**, which are a close proxy
for — not identical to — what a logged-in consumer sees in the app. That's what keeps it cheap
and maintainable. Consumer-exact UI-scraping is a later, community-driven track.

Not building: keyword clustering, generic audits, AI content writers. Enough tools do that.

---

## What's new

- **Onboarding wizard** — a 6-step guided setup: connect OpenRouter → scrape your site and draft
  a brand profile with AI → verify/edit that profile → pick engines → review AI-suggested
  prompts → confirm the cost and run (or skip and run later from the dashboard).
- **Simplified engine picker** — Settings → Engines now shows the same 4 vendor cards as
  onboarding instead of a raw 300-model list; the full catalogue is still one click away for
  anyone who wants a specific non-flagship model.
- **Login** — every page and API route sits behind a single-tenant account (signup is gated by
  a shared secret; no separate user management, no per-seat pricing).
- **Versioning** — the app tracks its own version and checks Docker Hub for updates.

---

## Hosting options

### One-click on Opsily (recommended)

[Opsily](https://opsily.com/hosting/habibi?utm_source=github&utm_medium=readme&utm_campaign=habibi)
is the easiest way to run Habibi. Create a server, deploy Habibi from the app store, and you get
a live URL in under a minute: no terminal required.

[![Deploy with Opsily](public/deploy-with-opsily.svg)](https://opsily.com/hosting/habibi?utm_source=github&utm_medium=readme&utm_campaign=habibi)

### Self-host with Docker

**1. Create your environment file**

```bash
cp .env.example .env
```

Fill in `.env` — at minimum, `HABIBI_SIGNUP_SECRET` so you can create your account (see
`.env.example` for all options). You do **not** need to add provider API keys here; the
onboarding wizard asks for your OpenRouter key and stores it encrypted in the database.

**2. Start the container**

```bash
docker compose up -d
```

Or pull the published image directly:

```bash
docker run -d -p 3000:3000 \
  --env-file .env \
  -e DATABASE_PATH=/app/data/app.db \
  -v $(pwd)/data:/app/data \
  moaljumaa/habibi:latest
```

Habibi is now running at `http://localhost:3000`. The SQLite database is persisted in `./data`
on your host machine.

### Self-host manually (Node.js)

Requires Node.js 22+.

```bash
npm install
cp .env.example .env      # set HABIBI_SIGNUP_SECRET at minimum
npm run build
npm start
```

---

## Setup

### 1. Create your account

Open the app, sign up with the secret you set as `HABIBI_SIGNUP_SECRET`, and you're dropped
straight into the onboarding wizard — there's no dashboard to find your way around first.

### 2. Connect OpenRouter

Paste an [OpenRouter](https://openrouter.ai/keys) API key. This is the one key that reaches
ChatGPT, Claude, Gemini, and Perplexity — you pay OpenRouter directly, in cents per run. The key
is validated live and stored encrypted in your database, never in a config file.

### 3. Point it at your website

Give the wizard your site's URL. It renders the page, reads the content, and an AI agent drafts
your brand profile — name, description, industry, brand-identity adjectives, and products/
services.

### 4. Verify your brand profile

Edit anything the draft got wrong. This becomes the context every later AI call uses, so it's
worth a look before moving on.

### 5. Choose engines

Toggle on the vendors you want tracked — ChatGPT, Claude, Gemini, Perplexity. Each auto-resolves
to that vendor's current flagship model; you don't need to pick a model ID.

### 6. Review your starter prompts

The wizard drafts a prompt set from your brand profile, grouped by topic. Uncheck anything you
don't want, edit the wording, or add your own — you can always add more later from **Prompts**.

### 7. Run it

The last step shows what a run will cost before you commit to it. Run now, or skip and start it
later from the dashboard's **Run now** button.

---

## License

[Sustainable Use License](./LICENSE) — free for personal and business use, self-host all you
want. The one restriction: you can't offer it as a managed hosting service to others. (Same
spirit as n8n / Cal.com.)

## Contributing

This is built in the open with the community that asked for it. Public roadmap lives in
GitHub Issues — 👍 the features you want and they get prioritised. Design and code contributions
credited by name. Say hi in Discussions.
