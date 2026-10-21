# Deploying Tradent on Vercel

Paper trading only: the app talks to the Alpaca Broker API **sandbox** and nothing else.
Everything below is done in your own accounts; never paste keys into chats or commit them.

Labels: **(checked)** was confirmed in the provider's docs, **(unchecked)** is from memory or
third-party pages, so the exact button names may differ.

## 0. Merge first

Vercel deploys `main`, and GitHub only runs scheduled workflows from `main` (unchecked), so merge
the stacked PRs (#1 to the deploy PR) in order before going public.

## 1. Database

1. In Vercel, open **Storage**, add **Neon** (Postgres, free tier) and connect it to the project (unchecked).
2. Make sure the project has a `DATABASE_URL` environment variable pointing at it, set for
   **Production** only, so preview deployments can't run migrations against it.

Migrations run on every production build, and on any build that has `DATABASE_URL` (`apps/web/vercel.json`). Preview builds without a database still build.

## 2. Import the project

1. **Add New → Project**, import `Daksh909/Tradent` from GitHub.
2. **Root Directory:** `apps/web`. Framework: Next.js. Leave the build command as is
   (`vercel.json` sets it).

## 3. Environment variables (Production)

| Name | Value |
|---|---|
| `DATABASE_URL` | From Neon (step 1) |
| `ALPACA_BROKER_API_KEY`, `ALPACA_BROKER_API_SECRET` | Your Broker API **sandbox** key |
| `ALPACA_BROKER_BASE_URL` | `https://broker-api.sandbox.alpaca.markets` |
| `ALPACA_DATA_BASE_URL` | `https://data.sandbox.alpaca.markets` |
| `ANTHROPIC_API_KEY` | A key from console.anthropic.com (starts with `sk-ant-api`) |
| `BETTER_AUTH_SECRET` | Output of `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Your site, e.g. `https://tradent.vercel.app` |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Step 4 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Step 4 |
| `CRON_SECRET` | Another `openssl rand -base64 32` |

Never set `TRADENT_DEMO_SIGN_IN` on Vercel: it lets anyone sign in as anyone.

## 4. Sign-in apps

- GitHub: github.com/settings/developers → New OAuth App, callback
  `https://<your site>/api/auth/callback/github`.
- Google: Cloud Console → Credentials → OAuth client ID (Web), redirect
  `https://<your site>/api/auth/callback/google`.

Optional: without these, visitors use "Continue as guest". With them, the Google and GitHub buttons appear next to it.

## 5. The decision timer (Decision 20)

Vercel's free plan runs cron jobs at most once a day (checked:
https://vercel.com/docs/cron-jobs/usage-and-pricing), so `.github/workflows/scheduler.yml` calls
`/api/cron/tick` every 5 minutes on weekdays instead. In the GitHub repo, open
**Settings → Secrets and variables → Actions** and add:

- `TRADENT_URL`: your site, e.g. `https://tradent.vercel.app`
- `CRON_SECRET`: the same value as on Vercel

Until both exist the workflow passes without doing anything. GitHub may start scheduled runs a few
minutes late and pauses them in public repos after 60 days without commits (unchecked).

## 6. Check it

- Open the site: the top bar should show the market status, not "unavailable".
- In GitHub, **Actions → Scheduler → Run workflow**; the log should show `"events"`.
- Start a forward test from Studio and watch the first decision appear in Forward tests.

TradingView alerts can then be sent to the webhook URLs on the Spend page (public HTTPS address,
port 443).
