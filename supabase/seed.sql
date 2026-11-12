-- =====================================================================
-- Bharat eVote — optional demonstration content
-- Run AFTER schema.sql, only if you want sample elections in the app.
-- Everything here is marked is_demo = true and can be deleted from the
-- admin panel. No ballots or participation records are fabricated.
-- =====================================================================

insert into public.elections
  (title, description, category_id, status, starts_at, ends_at, eligible_count, is_demo)
select v.title, v.description, c.id, v.status::public.election_status,
       now() + v.opens_in, now() + v.closes_in, v.eligible, true
from (values
  ('City Residents Welfare Association 2026',
   'Choose the residents'' panel that will represent your neighbourhood on civic maintenance, safety and community events for the coming year.',
   'Community governance', 'active', interval '-6 days', interval '4 days', 2400),
  ('Riverside Housing Society Committee',
   'Elect the society committee responsible for facility upkeep, annual budgeting and resident grievance handling.',
   'Housing society', 'active', interval '-3 days', interval '9 days', 860),
  ('National Youth Council — Chairperson',
   'A platform-wide election for the youth council chairperson, focused on skill programmes, volunteering and student outreach.',
   'Youth leadership', 'upcoming', interval '12 days', interval '19 days', 5200),
  ('Green Campus Sustainability Board',
   'Students and staff elect a board to steer waste management, solar adoption and campus-wide sustainability targets.',
   'Education', 'upcoming', interval '22 days', interval '26 days', 3100),
  ('District Sports Federation Secretary',
   'Draft election for the district sports federation secretary. Candidate nominations are still being reviewed.',
   'Sports federation', 'draft', interval '40 days', interval '47 days', 620)
) as v(title, description, category, status, opens_in, closes_in, eligible)
join public.election_categories c on c.name = v.category
where not exists (select 1 from public.elections e where e.title = v.title);

insert into public.candidates (election_id, name, affiliation, manifesto, color)
select e.id, v.name, v.affiliation, v.manifesto, v.color
from (values
  ('City Residents Welfare Association 2026', 'Ananya Deshmukh', 'Progressive Residents Panel',
   'Focused on transparent maintenance budgets, a resident grievance desk with 48-hour response times, and safer street lighting across all blocks.',
   '#2f6fed'),
  ('City Residents Welfare Association 2026', 'Rohit Malhotra', 'Independent',
   'Running as an independent voice for lower monthly charges and a published breakdown of every rupee spent, with competitive tendering for services.',
   '#0d8a4f'),
  ('City Residents Welfare Association 2026', 'Meera Krishnan', 'United Neighbours',
   'Prioritises rainwater harvesting, a community library for children and a residents'' emergency helpline, with a monthly progress scorecard.',
   '#ef7a1a'),
  ('City Residents Welfare Association 2026', 'Sanjay Verma', 'Independent',
   'A retired civil engineer proposing a five-year infrastructure plan covering drainage, lifts and parking allocation, with independent audits each year.',
   '#7c5cd6'),
  ('Riverside Housing Society Committee', 'Farhan Qureshi', 'Together for Riverside',
   'Wants a published annual budget, fair parking allocation and faster lift maintenance, plus a digital notice board for all society circulars.',
   '#2f6fed'),
  ('Riverside Housing Society Committee', 'Kavita Nair', 'Independent',
   'Focuses on water conservation, a dedicated senior-citizen support desk and community gardens in unused common areas.',
   '#0d8a4f'),
  ('Riverside Housing Society Committee', 'Deepak Rathore', 'Residents First',
   'Promises monthly financial summaries, a transparent vendor selection process and a 30-day resolution guarantee for complaints.',
   '#ef7a1a'),
  ('National Youth Council — Chairperson', 'Ishaan Bhatt', 'Youth Forward',
   'Proposes a national volunteering exchange, paid internships with local organizations and a mental-health support network for students.',
   '#2f6fed'),
  ('National Youth Council — Chairperson', 'Priya Menon', 'Independent',
   'Campaigns for transparent council spending, regional skill labs and a mentorship pipeline connecting students with professionals.',
   '#0d8a4f'),
  ('National Youth Council — Chairperson', 'Aarav Sinha', 'United Youth Alliance',
   'Wants every district represented in council decisions, with quarterly public reports and open applications for all council roles.',
   '#ef7a1a'),
  ('Green Campus Sustainability Board', 'Tara Iyer', 'Green Campus Collective',
   'Targets 100% waste segregation, 200 kW of rooftop solar and a student-run sustainability audit published every semester.',
   '#0d8a4f'),
  ('Green Campus Sustainability Board', 'Vikram Bose', 'Independent',
   'Proposes cycle-first mobility, water refill stations and a green innovation fund for student projects.',
   '#2f6fed'),
  ('Green Campus Sustainability Board', 'Neha Kulkarni', 'Campus Care Panel',
   'Wants measurable emissions reporting, an e-waste drive each term and sustainability included in orientation for every new student.',
   '#ef7a1a'),
  ('District Sports Federation Secretary', 'Harpreet Gill', 'Sports for All',
   'Plans district-level training camps, equal funding for women''s teams and upgraded grounds in every block.',
   '#2f6fed'),
  ('District Sports Federation Secretary', 'Nikhil Joshi', 'Independent',
   'Focuses on grassroots coaching, transparent selection trials and sports scholarships for underprivileged athletes.',
   '#0d8a4f')
) as v(election_title, name, affiliation, manifesto, color)
join public.elections e on e.title = v.election_title
where not exists (
  select 1 from public.candidates x where x.election_id = e.id and x.name = v.name
);
