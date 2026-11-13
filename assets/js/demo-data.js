/* ============================================================
   Bharat eVote — realistic demonstration dataset
   Used only when Supabase is not configured (or DB is empty).
   Every election created here is clearly labelled as demo data.
   ============================================================ */
window.DEMO_DATA = (function () {
  const DAY = 86400000;
  const now = Date.now();
  const iso = (offsetDays, hour = 10) => {
    const d = new Date(now + offsetDays * DAY);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const id = (p, n) => `${p}_${String(n).padStart(3, "0")}`;

  const candidates = [];
  const cand = (n, electionId, name, affiliation, manifesto, color) =>
    candidates.push({ id: id("c", n), electionId, name, role: affiliation, party: affiliation, manifesto, photoUrl: null, color });

  const elections = [];
  const el = (n, data) => elections.push({ id: id("e", n), ...data });

  el(1, {
    title: "City Residents Welfare Association 2026",
    description:
      "Choose the residents' panel that will represent your neighbourhood on civic maintenance, safety and community events for the coming year.",
    category: "Community governance",
    status: "active",
    startsAt: iso(-6, 9),
    endsAt: iso(4, 18),
    eligible: 2400,
    createdAt: iso(-24),
    publishedAt: null,
    demo: { total: 1462, series: [180, 240, 275, 230, 205, 190, 142] }
  });
  el(2, {
    title: "Riverside Housing Society Committee",
    description:
      "Elect the society committee responsible for facility upkeep, annual budgeting and resident grievance handling.",
    category: "Housing society",
    status: "active",
    startsAt: iso(-3, 8),
    endsAt: iso(9, 20),
    eligible: 860,
    createdAt: iso(-18),
    publishedAt: null,
    demo: { total: 404, series: [52, 74, 68, 61, 55, 48, 46] }
  });
  el(3, {
    title: "National Youth Council — Chairperson",
    description:
      "A platform-wide election for the youth council chairperson, focused on skill programmes, volunteering and student outreach.",
    category: "Youth leadership",
    status: "upcoming",
    startsAt: iso(12, 9),
    endsAt: iso(19, 18),
    eligible: 5200,
    createdAt: iso(-10),
    publishedAt: null,
    demo: { total: 0, series: [0, 0, 0, 0, 0, 0, 0] }
  });
  el(4, {
    title: "Green Campus Sustainability Board",
    description:
      "Students and staff elect a board to steer waste management, solar adoption and campus-wide sustainability targets.",
    category: "Education",
    status: "upcoming",
    startsAt: iso(22, 10),
    endsAt: iso(26, 17),
    eligible: 3100,
    createdAt: iso(-8),
    publishedAt: null,
    demo: { total: 0, series: [0, 0, 0, 0, 0, 0, 0] }
  });
  el(5, {
    title: "IIT Alumni Association President 2026",
    description:
      "Alumni across chapters elect the association president for a two-year term covering mentorship, funding and chapter growth.",
    category: "Alumni association",
    status: "published",
    startsAt: iso(-16, 9),
    endsAt: iso(-9, 18),
    eligible: 4210,
    createdAt: iso(-45),
    publishedAt: iso(-8, 11),
    demo: { total: 2863, series: [410, 468, 502, 455, 401, 356, 271] }
  });
  el(6, {
    title: "Startup Founders Guild — Ethics Council",
    description:
      "Members elect an ethics council to review community guidelines, dispute resolution and transparent funding practices.",
    category: "Professional body",
    status: "published",
    startsAt: iso(-32, 9),
    endsAt: iso(-25, 18),
    eligible: 1780,
    createdAt: iso(-60),
    publishedAt: iso(-24, 12),
    demo: { total: 961, series: [140, 165, 152, 138, 128, 122, 116] }
  });
  el(7, {
    title: "Public Library Trust Board",
    description:
      "Trust members elect three board representatives to oversee the reading programme, digital archives and branch expansion.",
    category: "Trust",
    status: "closed",
    startsAt: iso(-9, 9),
    endsAt: iso(-2, 18),
    eligible: 1340,
    createdAt: iso(-30),
    publishedAt: null,
    demo: { total: 777, series: [120, 130, 118, 112, 104, 98, 95] }
  });
  el(8, {
    title: "District Sports Federation Secretary",
    description:
      "Draft election for the district sports federation secretary. Candidate nominations are still being reviewed.",
    category: "Sports federation",
    status: "draft",
    startsAt: iso(40, 9),
    endsAt: iso(47, 18),
    eligible: 620,
    createdAt: iso(-2),
    publishedAt: null,
    demo: { total: 0, series: [0, 0, 0, 0, 0, 0, 0] }
  });

  /* ---- candidates ---- */
  cand(1, "e_001", "Ananya Deshmukh", "Progressive Residents Panel",
    "Focused on transparent maintenance budgets, a resident grievance desk with 48-hour response times, and safer street lighting across all blocks. Plans quarterly open forums so every household can review spending.", "#2f6fed");
  cand(2, "e_001", "Rohit Malhotra", "Independent",
    "Running as an independent voice for lower monthly charges and a published breakdown of every rupee spent. Wants competitive tendering for housekeeping and security contracts.", "#0d8a4f");
  cand(3, "e_001", "Meera Krishnan", "United Neighbours",
    "Prioritises rainwater harvesting, a community library for children and a residents' emergency helpline. Commits to publishing a monthly progress scorecard.", "#ef7a1a");
  cand(4, "e_001", "Sanjay Verma", "Independent",
    "A retired civil engineer proposing a five-year infrastructure plan covering drainage, lifts and parking allocation, with independent audits each year.", "#7c5cd6");

  cand(5, "e_002", "Farhan Qureshi", "Together for Riverside",
    "Wants a published annual budget, fair parking allocation and faster lift maintenance. Proposes a digital notice board for all society circulars.", "#2f6fed");
  cand(6, "e_002", "Kavita Nair", "Independent",
    "Focuses on water conservation, a dedicated senior-citizen support desk and community gardens in unused common areas.", "#0d8a4f");
  cand(7, "e_002", "Deepak Rathore", "Residents First",
    "Promises monthly financial summaries, a transparent vendor selection process and a 30-day resolution guarantee for complaints.", "#ef7a1a");

  cand(8, "e_003", "Ishaan Bhatt", "Youth Forward",
    "Proposes a national volunteering exchange, paid internships with local organizations and a mental-health support network for students.", "#2f6fed");
  cand(9, "e_003", "Priya Menon", "Independent",
    "Campaigns for transparent council spending, regional skill labs and a mentorship pipeline connecting students with professionals.", "#0d8a4f");
  cand(10, "e_003", "Aarav Sinha", "United Youth Alliance",
    "Wants every district represented in council decisions, with quarterly public reports and open applications for all council roles.", "#ef7a1a");
  cand(11, "e_003", "Nandini Rao", "Independent",
    "Focuses on accessible education, campus safety audits and partnerships with local employers for first-time job seekers.", "#7c5cd6");

  cand(12, "e_004", "Tara Iyer", "Green Campus Collective",
    "Targets 100% waste segregation, 200 kW of rooftop solar and a student-run sustainability audit published every semester.", "#0d8a4f");
  cand(13, "e_004", "Vikram Bose", "Independent",
    "Proposes cycle-first mobility, water refill stations and a green innovation fund for student projects.", "#2f6fed");
  cand(14, "e_004", "Neha Kulkarni", "Campus Care Panel",
    "Wants measurable emissions reporting, an e-waste drive each term and sustainability included in orientation for every new student.", "#ef7a1a");

  cand(15, "e_005", "Aditya Narayanan", "Alumni Unity",
    "Plans a mentorship network linking 5,000 alumni with students, transparent scholarship funding and stronger regional chapters.", "#2f6fed");
  cand(16, "e_005", "Sneha Pillai", "Independent",
    "Campaigns for an open alumni fund dashboard, affordable continuing-education credits and an annual alumni impact report.", "#0d8a4f");
  cand(17, "e_005", "Rahul Sethi", "Vision 2030 Panel",
    "Focuses on industry partnerships, an entrepreneurship grant programme and better support for alumni relocating abroad.", "#ef7a1a");
  cand(18, "e_005", "Divya Menon", "Independent",
    "Wants alumni chapters to run local community projects, with annual audited accounts and open nominations for every position.", "#7c5cd6");

  cand(19, "e_006", "Kabir Anand", "Open Guild",
    "Proposes a published ethics charter, an independent review committee and anonymous reporting channels for members.", "#7c5cd6");
  cand(20, "e_006", "Ritika Shah", "Independent",
    "Focuses on fair dispute resolution timelines, clear conflict-of-interest rules and annual transparency reporting.", "#2f6fed");
  cand(21, "e_006", "Mohan Das", "Founders' Voice",
    "Wants smaller working groups, rotating council seats and a public log of every council decision.", "#0d8a4f");

  cand(22, "e_007", "Lakshmi Subramanian", "Readers' Panel",
    "Committed to extending weekend opening hours, expanding the digital archive and running free literacy programmes.", "#ef7a1a");
  cand(23, "e_007", "Arjun Patel", "Independent",
    "Wants transparent trust accounts, a new children's wing and partnerships with local schools for reading drives.", "#2f6fed");
  cand(24, "e_007", "Zoya Khan", "Open Library Forum",
    "Focuses on accessible formats, braille and audiobook collections, and a mobile library for nearby villages.", "#0d8a4f");

  cand(25, "e_008", "Harpreet Gill", "Sports for All",
    "Plans district-level training camps, equal funding for women's teams and upgraded grounds in every block.", "#2f6fed");
  cand(26, "e_008", "Nikhil Joshi", "Independent",
    "Focuses on grassroots coaching, transparent selection trials and sports scholarships for underprivileged athletes.", "#0d8a4f");

  const voters = [
    { id: "u_admin", name: "Aarav Mehta", email: "admin@bharatevote.demo", password: "Admin@123", phone: "+91 98200 11223", role: "admin", verified: true, status: "verified", registeredAt: iso(-90) },
    { id: "u_voter", name: "Dhruw", email: "voter@bharatevote.demo", password: "Voter@123", phone: "+91 98765 43210", role: "voter", verified: true, status: "verified", registeredAt: iso(-42) },
    { id: "u_003", name: "Rohan Kulkarni", email: "rohan.k@example.com", phone: "", role: "voter", verified: true, status: "verified", registeredAt: iso(-31) },
    { id: "u_004", name: "Fatima Sheikh", email: "fatima.s@example.com", phone: "", role: "voter", verified: true, status: "verified", registeredAt: iso(-28) },
    { id: "u_005", name: "Devansh Yadav", email: "devansh.y@example.com", phone: "", role: "voter", verified: false, status: "pending", registeredAt: iso(-19) },
    { id: "u_006", name: "Anjali Menon", email: "anjali.m@example.com", phone: "", role: "voter", verified: true, status: "verified", registeredAt: iso(-15) },
    { id: "u_007", name: "Imran Baig", email: "imran.b@example.com", phone: "", role: "voter", verified: true, status: "verified", registeredAt: iso(-12) },
    { id: "u_008", name: "Sneha Reddy", email: "sneha.r@example.com", phone: "", role: "voter", verified: true, status: "verified", registeredAt: iso(-9) },
    { id: "u_009", name: "Karan Chopra", email: "karan.c@example.com", phone: "", role: "voter", verified: false, status: "pending", registeredAt: iso(-6) },
    { id: "u_010", name: "Nisha Verma", email: "nisha.v@example.com", phone: "", role: "voter", verified: true, status: "suspended", registeredAt: iso(-4) },
    { id: "u_011", name: "Aditya Rane", email: "aditya.r@example.com", phone: "", role: "voter", verified: true, status: "verified", registeredAt: iso(-3) },
    { id: "u_012", name: "Pooja Iyer", email: "pooja.i@example.com", phone: "", role: "voter", verified: true, status: "verified", registeredAt: iso(-1) }
  ];

  /* Historical participation for the demo voter (no candidate selection recorded here). */
  const participation = [
    { id: "p_001", electionId: "e_005", userId: "u_voter", votedAt: iso(-13, 12), receipt: "BVT-8F2K-91QA" },
    { id: "p_002", electionId: "e_006", userId: "u_voter", votedAt: iso(-29, 16), receipt: "BVT-4LMP-27XZ" }
  ];

  const activity = {
    u_voter: [
      { id: "a1", type: "registration", text: "Account registration completed", at: iso(-42) },
      { id: "a2", type: "verification", text: "Identity verification completed", at: iso(-41) },
      { id: "a3", type: "vote", text: "Vote successfully submitted — IIT Alumni Association President 2026", at: iso(-13, 12) },
      { id: "a4", type: "vote", text: "Vote successfully submitted — Startup Founders Guild Ethics Council", at: iso(-29, 16) },
      { id: "a5", type: "results", text: "Results published — Startup Founders Guild Ethics Council", at: iso(-24, 12) }
    ]
  };

  const audit = [];
  let prev = "GENESIS";
  const hash = (s) => {
    let h1 = 0x811c9dc5, h2 = 0xc2b2ae35;
    for (let i = 0; i < s.length; i++) {
      h1 = (h1 ^ s.charCodeAt(i)) * 16777619 >>> 0;
      h2 = (h2 + s.charCodeAt(i) * (i + 7)) >>> 0;
    }
    return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 16);
  };
  const log = (actor, action, target, detail, at) => {
    const entry = { id: "al_" + (audit.length + 1), actor, action, target, detail, createdAt: at, prevHash: prev };
    entry.hash = hash(JSON.stringify({ ...entry, prevHash: prev }));
    prev = entry.hash;
    audit.push(entry);
  };

  log("Aarav Mehta", "election.published", "IIT Alumni Association President 2026", "Results published after voting closed", iso(-8, 11));
  log("Aarav Mehta", "election.published", "Startup Founders Guild — Ethics Council", "Results published after voting closed", iso(-24, 12));
  log("Aarav Mehta", "voter.verified", "Anjali Menon", "Voter eligibility approved", iso(-14, 15));
  log("Aarav Mehta", "election.activated", "Riverside Housing Society Committee", "Election opened for voting", iso(-3, 8));
  log("Aarav Mehta", "candidate.added", "City Residents Welfare Association 2026", "Candidate profile added: Sanjay Verma", iso(-2, 17));
  log("Aarav Mehta", "voter.suspended", "Nisha Verma", "Account suspended pending review", iso(-1, 10));

  return {
    version: 6,
    directoryTotal: 1284,
    categories: [
      { id: "cat1", name: "Community governance" },
      { id: "cat2", name: "Housing society" },
      { id: "cat3", name: "Youth leadership" },
      { id: "cat4", name: "Education" },
      { id: "cat5", name: "Alumni association" },
      { id: "cat6", name: "Professional body" },
      { id: "cat7", name: "Trust" },
      { id: "cat8", name: "Sports federation" }
    ],
    elections,
    candidates,
    voters,
    participation,
    ballots: [],
    activity,
    audit,
    myVotes: {},
    notifications: {
      u_voter: [
        { id: "n1", text: "Riverside Housing Society Committee is open for voting until " + new Date(iso(9, 20)).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + ".", read: false, createdAt: iso(-1, 9) },
        { id: "n2", text: "Results published: IIT Alumni Association President 2026.", read: false, createdAt: iso(-8, 11) },
        { id: "n3", text: "Your identity verification was completed successfully.", read: true, createdAt: iso(-41) }
      ],
      u_admin: [
        { id: "n4", text: "Public Library Trust Board has closed and is awaiting result publication.", read: false, createdAt: iso(-2, 18) },
        { id: "n5", text: "Two voter registrations are pending verification.", read: false, createdAt: iso(-1, 10) }
      ]
    },
    settings: {
      requireVerification: true,
      allowSelfRegistration: true,
      publicResultsOnlyWhenPublished: true,
      anonymousBallots: true,
      orgName: "Bharat eVote",
      supportEmail: "workwithdhruw@gmail.com"
    }
  };
})();
