/* ============================================================
   Bharat eVote — public configuration
   ------------------------------------------------------------
   Only the Supabase project URL and the PUBLIC key belong here:
     • publishable key  (sb_publishable_…)  ← current key model
     • anon key         (legacy JWT)        ← still accepted
   Never place a secret key (sb_secret_…) or service_role key in
   frontend code; those bypass Row Level Security.
   See README.md → "Connect Supabase" for setup steps.
   ============================================================ */
window.APP_CONFIG = {
  supabaseUrl: "https://elrbwwaqwuduhalzsywx.supabase.co",
  supabaseAnonKey: "sb_publishable_n21hAj76IOrkpPoiqHKZaw_z6LU0sx2", // publishable key — safe in the browser, RLS enforces access
  siteName: "Bharat eVote",
  tagline: "Your Voice. Your Vote. Your Future.",
  supportEmail: "workwithdhruw@gmail.com",
  // Elections are treated as demo/sample content while this flag is true.
  demoData: true
};

/* Brand mark: saffron → green check inside a navy tile (see assets/css/base.css) */
window.BRAND_MARK_SVG = `
<svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
  <defs>
    <linearGradient id="bvg" x1="6" y1="26" x2="27" y2="6" gradientUnits="userSpaceOnUse">
      <stop stop-color="#EF7A1A"/><stop offset=".5" stop-color="#E8660F"/><stop offset="1" stop-color="#0D8A4F"/>
    </linearGradient>
  </defs>
  <path d="M7.5 16.6l5.4 5.6" stroke="#F58220" stroke-width="3.6" stroke-linecap="round"/>
  <path d="M13.3 21.8L24.6 9.2" stroke="url(#bvg)" stroke-width="3.6" stroke-linecap="round"/>
</svg>`;
