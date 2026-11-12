# Bharat eVote

**Your Voice. Your Vote. Your Future.**

A general-purpose online voting platform for organisations, communities, associations and institutions. Built with HTML5, CSS3, vanilla JavaScript, Chart.js and Supabase — with anonymous ballots, verified eligibility, atomic duplicate-vote prevention and a hash-chained audit trail.

> Educational prototype. Bharat eVote is **not** affiliated with the Government of India or the Election Commission, has **no** Aadhaar/government identity integration, **no** blockchain ledger and **no** official election certification.

---

## 1. What runs today

The frontend ships with two interchangeable data adapters behind one API (`assets/js/store.js`):

| Mode | When | Data |
|---|---|---|
| **Demo** (default) | `APP_CONFIG.supabaseUrl` is empty | Seeded demonstration elections in `localStorage`, labelled "Demo data" in the UI |
| **Supabase** | URL + anon key configured and `schema.sql` applied | Live PostgreSQL, Auth, Storage, Edge Functions |

Nothing is faked silently: demo records carry a `Demo data` chip, the voter dashboard shows a demo banner, and the admin overview states it is a demonstration dataset.

## 2. Features

**Public / voter**
- Landing page with brand identity, features, how-it-works, security notes and FAQ.
- Registration (name, email, password + confirmation, optional phone), sign in/out, password reset, email confirmation (Supabase mode).
- Voter dashboard: available/active elections, elections participated, published results, recent activity, participation chart, upcoming countdowns, editable profile.
- Election browsing with status/category filters and search.
- Distraction-free ballot: candidate photos, affiliations, expandable manifestos, explicit instructions, review-and-confirm dialog, receipt, duplicate-vote guard.
- Results page: turnout, candidate-wise counts, bar and doughnut charts, winner card — **sealed until publication**.
- English / हिन्दी switcher, keyboard-navigable controls, labelled form fields and skip-free tab order.

**Administrator** (`admin.html`, fixed sidebar)
- Dashboard: registered voters, total/active/upcoming/completed elections, ballots cast, 7/30-day participation trend, ballot distribution, audit-backed activity, active and upcoming lists, status overview.
- Elections: create/edit drafts, set window, eligibility, activate, close, publish, delete drafts, export CSV.
- Candidates: photo upload, affiliation, manifesto, per-election management.
- Voters: search, filter, approve, reject, suspend/restore.
- Voting activity: aggregate only — never an individual ballot.
- Results: provisional tally after closure, publish, export.
- Analytics: turnout by election, status mix, ballots by category.
- Audit log: hash-chained entries with a chain verification check.
- Settings: verification policy, self-registration, publication policy, organisation identity.

## 3. Stack

- **Frontend:** HTML5, CSS3, vanilla JS (no framework, no build step)
- **UI:** custom design system, Lucide icons, Chart.js 4
- **Backend:** Supabase PostgreSQL, Auth, Storage, Edge Functions (Deno/TypeScript)
- **Hosting:** any static host — Netlify, Vercel, GitHub Pages

## 4. Project structure

```
├── index.html                 Landing page
├── login.html                 Register / sign in / reset
├── dashboard.html             Voter dashboard
├── elections.html             Browse elections
├── vote.html                  Ballot + confirmation
├── results.html               Published results
├── admin.html                 Administrator shell
├── assets/
│   ├── css/base.css           Tokens, nav, buttons, forms, footer
│   ├── css/app.css            Cards, tables, admin shell, modal
│   ├── css/pages.css          Landing, auth, ballot, results
│   ├── js/config.js           Public Supabase config (anon key only)
│   ├── js/i18n.js             English + Hindi dictionaries
│   ├── js/ui.js               Chrome, formatting, modal, toasts, charts
│   ├── js/demo-data.js        Demonstration dataset
│   ├── js/store.js            Data facade + demo adapter
│   ├── js/remote.js           Supabase adapter
│   └── js/pages/*.js          One module per page
├── supabase/
│   ├── schema.sql             Tables, constraints, RLS, functions, triggers
│   └── functions/
│       ├── cast-vote/         Rate-limited atomic ballot submission
│       └── admin-action/      Authorised administrator operations
└── tools/serve.pl             Dependency-free local preview server
```

## 5. Run it locally

No Node, Python or PHP required.

```bash
perl tools/serve.pl 4173
# → http://localhost:4173/
```

Any static server works too (`npx serve`, `python -m http.server`, VS Code Live Server). Opening the HTML files with `file://` will not work because the app uses ES-friendly modules and `localStorage` per origin.

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Voter | `voter@bharatevote.demo` | `Voter@123` |
| Administrator | `admin@bharatevote.demo` | `Admin@123` |

New registrations start as *pending* — approve them from **Admin → Manage voters**, or use the verification prompt on the demo dashboard. Reset demo data by clearing site data for the origin.

## 6. Connect Supabase

1. Create a project at supabase.com.
2. **SQL Editor → New query**, paste `supabase/schema.sql`, run it. This creates tables, constraints, indexes, RLS policies, the `cast_ballot` function, result RPC, audit chain, storage bucket and settings row.
3. **Authentication → Providers → Email**: enable email sign-ups. For quick local testing disable "Confirm email"; re-enable it for real use.
4. **Project Settings → API**: copy the Project URL and the **anon public** key into `assets/js/config.js`:

```js
window.APP_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR-ANON-KEY",   // public key only
  demoData: false
};
```

5. Register an account in the app, then promote it once in the SQL editor:

```sql
update public.profiles
set role = 'admin', verified = true, status = 'verified'
where email = 'you@example.com';
```

6. Deploy the Edge Functions (Supabase CLI):

```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase functions deploy cast-vote
supabase functions deploy admin-action
```

`admin-action` needs the service role key, which Supabase injects automatically as `SUPABASE_SERVICE_ROLE_KEY` in the function environment. It is never shipped to the browser. Optionally set `APP_ORIGIN` for CORS:

```bash
supabase secrets set APP_ORIGIN=https://your-site.example
```

7. Create elections in **Admin → Manage elections**, add at least two candidates, then activate.

## 7. Security model

- **Anonymity.** `voter_participation` (election, voter, receipt) and `anonymous_ballots` (election, candidate, timestamp) are separate tables. There is no foreign key, column or view joining a ballot to a voter.
- **One ballot.** `unique (election_id, user_id)` on participation is enforced inside `cast_ballot()`, which locks the election row and writes participation + ballot in a single transaction. A concurrent second attempt raises `unique_violation` and is rejected.
- **Authorisation.** RLS scopes every table. `anonymous_ballots` denies direct `SELECT` to everyone, including administrators; totals are exposed through `get_election_results()`, which returns rows only when published (or to admins for a closed election). Administrative writes run only through `admin-action`, which re-checks the caller's profile server-side.
- **Audit trail.** `append_audit()` stores the previous entry's hash with every event, so editing history breaks the chain. Ballot events deliberately contain no voter or candidate identifier.
- **Rate limiting.** `assert_rate_limit()` throttles ballot attempts per user; `cast-vote` calls it before touching the database.
- **Files.** Candidate photos are validated for type/size client-side and stored in a public-read bucket that only administrators can write to.
- **Secrets.** Only the anon key is public. Service-role credentials live exclusively in the Edge Function environment.

## 8. Deployment

The frontend is static:

- **Netlify:** drag the project folder into Netlify Drop, or connect the Git repo with publish directory `.` and no build command.
- **Vercel:** import the repo, framework preset **Other**, output directory `.`.
- **GitHub:** `git init && git add . && git commit -m "Bharat eVote"`, then push.

Test sign-in, a full ballot, publication, and a signed-out visit on the deployed origin. Review Supabase Auth redirect URLs and the `APP_ORIGIN` secret for CORS.

## 9. Intentional limitations

- No Aadhaar, DigiLocker or other government identity verification; eligibility is configured by administrators.
- No blockchain anchoring; tamper evidence is a hash chain in PostgreSQL.
- No official Election Commission or government certification is claimed anywhere in the UI.
- The demo adapter is a local prototype store, not a security boundary (a user can edit their own browser storage). RLS in Supabase is the enforcing layer.

## 10. Suggested next steps

1. Invitation-only voter onboarding and bulk eligibility import (CSV).
2. Per-election eligibility rules with cohorts/segments.
3. Email delivery for receipts and result publication (transactional provider + Edge Function).
4. Two-factor authentication for administrator accounts.
5. Scheduled jobs to open/close elections automatically.
6. Additional Indian language packs in `assets/js/i18n.js`.
