# CDM — Deal Coordination

Turns Zoom sales calls into coordinated deal action across Finance, Engineering, and Legal.

## Architecture

- **Vercel** hosts the Next.js app: the landing page, the `/demo` sandbox
  (sample data, no login), and — if you use it — the real managed pipeline
  at `/dashboard`.
- **The installer** (`installer/`) is a separate Electron app. It's the BYOC
  path: end users download it from the landing page, click through a 3-step
  wizard inside the app itself, and it silently checks for Docker, installs
  it if missing, and brings up the app + Postgres via Docker Compose. No
  terminal use for them.
- **GitHub Actions** does two jobs: `docker-publish.yml` builds this repo's
  `Dockerfile` and pushes it to `ghcr.io/<you>/cdm` on every push to `main` —
  that's the image `docker-compose.yml` and the installer both pull.
  `build-installer.yml` builds the actual Windows/Mac/Linux installer
  binaries from `installer/` and attaches them to a GitHub Release whenever
  you push a `v*` tag.

## One-time setup after you push this repo

1. Push to `main` once — `docker-publish.yml` builds and pushes the image.
2. On GitHub: **Packages → cdm → Package settings → Change visibility → Public.**
   Skipping this means `docker pull` fails for every end user, since they
   have no GHCR login and adding one would mean a terminal step.
3. Tag a release: `git tag v1.0.0 && git push --tags` (or do it from GitHub's
   UI under Releases → Draft a new release, which creates the tag for you).
   This triggers `build-installer.yml` and produces the three installer
   files the landing page links to.
4. If your GitHub username/repo isn't `lalith0192837465-create/cdm`, update
   the hardcoded URLs in `app/components/DownloadButtons.tsx`,
   `docker-compose.yml`, and `installer/main.js` to match.
5. Connect the repo to Vercel and deploy. Local dev and the managed
   `/dashboard` path still need the env vars from the table below set in
   Vercel's project settings.

## Local development

```bash
npm install
cp .env.example .env.local
# for local dev, set DATABASE_URL="file:./dev.db" and switch
# prisma/schema.prisma provider back to "sqlite"
npx prisma generate
npx prisma db push
npm run seed        # optional: adds 4 sample deals
npm run dev
```

## BYOC deployment — manual path (no installer)

```bash
git clone <this-repo-url>
cd cdm-self-host
cp .env.example .env   # fill in real values
chmod +x install.sh && ./install.sh
```

This pulls the pre-built image from GHCR — it does not build the app
locally, so it works even without the app source present.

## Required environment variables

| Var | Where to get it |
|---|---|
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` (both wizards generate one) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console → OAuth credentials |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `RECALL_API_KEY` | recall.ai dashboard |
| `SLACK_WEBHOOK_URL` | Slack app → Incoming Webhooks |

## How the pipeline works

1. Sales rep starts a bot on a Zoom call → `POST /api/deals`
2. Recall.ai finishes recording → hits `POST /api/webhooks/recall`
3. That route pulls the transcript, calls Anthropic to extract deal terms, and stores the deal with `confirmationStatus: "pending"`
4. A human reviews it on `/dashboard` → "Awaiting confirmation" tab
5. They click **Confirm & route** → `POST /api/deals/[id]/confirm`
6. Finance, Engineering, and Legal each get a Slack message with their specific tasks

## Pages

- `/` — landing page (demo CTA + installer download)
- `/demo` — fully interactive, no login, sample data
- `/auth/signin` — Google sign-in
- `/dashboard` — real pipeline (requires auth)

## Notes on what's untested

I wrote and reasoned through all of this but could not run `npm install`,
`docker build`, or `electron-builder` myself — my environment has no network
access. Treat the Docker image build, the Electron install flow (especially
the per-OS Docker auto-install logic in `installer/docker-setup.js`), and
the GitHub Actions workflows as needing a real first run before you hand
this to a customer. The Recall transcript fetch (`lib/recall.ts`) validates
the download URL's hostname against an explicit allowlist before fetching —
do not loosen this check.
