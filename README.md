# 🏠 Reckon

**A production-ready "shared-life hub" for friend groups, roommates, and households.**

Manage shared expenses, track chores, align availability, vote on hangouts, and get AI-powered insights—all localized in English, Urdu, and Spanish, with deep integration for the Pakistani payment ecosystem.

🌐 [Live demo](#) | 📖 [Documentation](#)

    https://reckon-xi.vercel.app/

## Why this project exists

Reckon isn't a toy CRUD app or a simple Splitwise clone. It's a comprehensive household management system built for real-world usage. 

When living with others, managing money is only half the battle. Figuring out when everyone is free, who hasn't done the dishes, and how to fairly split an itemized receipt shouldn't require five different apps. Reckon brings all of this into a single, cohesive, multi-lingual platform, complete with real background pipelines, AI assistance, rate limiting, and a UI designed from scratch.

## ✨ What it does

| | |
| --- | --- |
| 💸 **Shared Expenses** | Not just simple splits. Features AI receipt-scanning via Gemini that parses line items, allowing each person to claim specific sub-items while proportionally distributing unaccounted taxes and fees. |
| 🤝 **IOUs & Settlements** | Track personal IOUs with "Forgive" actions. The backend settlements engine computes the most efficient payback paths. Integrates with Safepay for actual checkout and webhooks. |
| 🧹 **Chores & Fairness** | Complete chore rotation system with completion tracking, "Mark done" buttons, and visual fairness bars to ensure everyone pulls their weight. |
| 📅 **Availability Grid** | Drag-to-select week-grid calendar to find when everyone is free. Auto-computes "best times" and handles recurring-weekly availability. |
| 🗳️ **Blind Voting** | Propose hangouts with blind voting (Yes/If-needed/No) to avoid anchoring bias. Auto-resolves once everyone votes and includes a Leaflet-powered meeting point map. |
| 🧠 **AI Ask & Recaps** | Ask natural language questions about your household (e.g., "Are there dietary conflicts?"). Monthly recaps are persisted in Spotify Wrapped-style stat cards highlighting "Chore MVPs" and "Big Spenders." |
| 🌍 **True i18n & RTL** | First-class localization for English, Urdu (with automatic Right-to-Left layout mirroring), and Spanish. Zero-dependency custom implementation tailored for authenticated users. |
| 🇵🇰 **Local Payments** | Built with the Pakistani ecosystem in mind. Native support for EasyPaisa, JazzCash, NayaPay, and bank transfers alongside international options. |

## 🛠️ Tech stack

| Layer | Tech | Why |
| --- | --- | --- |
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router, Turbopack) + [React 19](https://react.dev/) | Server Components, streaming, one codebase for UI + API |
| **Language** | TypeScript, strict mode | Every model, route, and component is typed end-to-end |
| **Auth** | [Clerk](https://clerk.com/) | Session management, sign-up flows, per-user data isolation |
| **Database** | [PostgreSQL (Neon)](https://neon.tech/) + Prisma | Relational data for groups, IOUs, and expenses; connection pooling |
| **Background jobs** | [Inngest](https://www.inngest.com/) | Durable, retryable async pipeline for background processing |
| **AI Inference** | Google Gemini API | Powers the "Ask" Q&A feature and itemized receipt parsing |
| **Rate limiting** | Upstash Redis | Per-user limits on auth-adjacent and AI endpoints |
| **Payments** | Safepay | Real sandbox integration for local checkout (EasyPaisa/JazzCash) |
| **Maps** | React Leaflet | Visualizing meeting points for proposals |
| **UI Components** | shadcn/ui + Motion | Composable, accessible, animated primitives |
| **Styling** | Tailwind CSS v4 | Design tokens for light/dark theming and custom styling |
| **Testing** | Vitest | Fast unit tests for logic and algorithms (grids, IOUs, etc.) |

## 📁 Project structure

```text
src/
├── app/
│   ├── api/                   REST-ish route handlers (Safepay webhooks, Inngest)
│   ├── confirm/               One-tap email "Yes, I received this" confirm links
│   ├── friends/               Cross-group net-balance overviews
│   ├── groups/[groupId]/      The core hub (expenses, chores, IOUs, availability, etc.)
│   └── layout.tsx             Root layout with RTL/LTR direction based on locale
├── components/
│   ├── availability/          Week-grid calendar, drag-to-select, free-time list
│   ├── chores/                Chore rotation lists, completion tracking, fairness bars
│   ├── expenses/              Itemized receipt splitting, camera/file upload
│   ├── groups/                Group settings, searchable currency picker
│   ├── ious/                  Quick-add chips, forgive button logic
│   ├── proposals/             Blind voting UI, Leaflet meeting point maps
│   └── ui/                    shadcn/ui base components
├── dictionaries/              JSON dictionaries for en, ur, es (zero-dependency i18n)
└── lib/
    ├── i18n.ts                Client-safe locale constants and interpolation
    ├── dictionary.ts          Server-only dictionary fetching
    ├── money.ts               Intl.NumberFormat multi-currency logic
    └── ...                    Core algorithms (settlements, availability grids)
```

## 🚀 Getting started

### Prerequisites

- Node.js 20+
- A [PostgreSQL](https://neon.tech/) database (Neon free tier works)
- A [Clerk](https://clerk.com/) application (free tier)
- A [Google Gemini](https://aistudio.google.com/) API key
- An [Upstash Redis](https://upstash.com/) database (free tier)
- Safepay sandbox credentials (optional, for payments)

### 🔗 1. Clone & install

```bash
git clone https://github.com/ibrahimshaykh/Reckon.git
cd Reckon
npm install
```

### 2. Configure environment variables

Copy `.env.example` -> `.env.local` and fill in:

```bash
DATABASE_URL=postgres://<user>:<password>@<endpoint>.neon.tech/reckon

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

GEMINI_API_KEY=

# Optional (Safepay integration)
NEXT_PUBLIC_SAFEPAY_ENVIRONMENT=sandbox
NEXT_PUBLIC_SAFEPAY_API_KEY=
SAFEPAY_SECRET_KEY=
```

### 3. Run it

Apply database migrations first:
```bash
npx prisma migrate deploy
npx prisma generate
```

Then start the development server:
```bash
PORT=3001 npm run dev
```

This starts Next.js on port 3001 to avoid conflicts. Open [http://localhost:3001](http://localhost:3001).

### 4. Run the tests

```bash
npm test
```

## ☁️ Deployment

Reckon is designed to deploy seamlessly on [Vercel](https://vercel.com). Push to `main` and Vercel builds and deploys automatically; production env vars are configured in the Vercel dashboard. The Neon database scales seamlessly with serverless environments.

## 🔒 Security & data isolation

- Every API route validates its input with Zod before touching the database.
- Every Prisma query is scoped to the authenticated user — there is no code path that reads another household's expenses, chores, or proposals.
- Auth-adjacent and AI endpoints are rate-limited per user via Upstash.
- Uploaded files live in Vercel Blob, not on the server filesystem; secrets and local env files are git-ignored.

---

Built solo, end-to-end: schema design, background job orchestration, AI prompt engineering, API layer, and every pixel of the UI.
