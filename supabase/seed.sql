-- Ten open roles, carried over from the prototype so Phase 0 has real
-- content to browse. Replace with the ATS sync in Phase 1.

insert into public.jobs
  (req_id, title, department, location, experience_band, is_priority, reward_amount, eligibility_days, summary, skills, posted_on)
values
  ('CG-1042','Senior Program Manager','Programs','Delhi','5-8 yrs',true,20000,30,
   'Lead state-level programme delivery for SwiftPAL across 400+ government schools. Own district relationships, field team performance and the monthly review cadence with the education department.',
   array['Government partnerships','Programme delivery','Stakeholder management'],'2026-08-28'),
  ('CG-1051','Product Manager, Learning','Product','Bengaluru','4-7 yrs',true,15000,30,
   'Own the learning experience for SwiftChat, from content structure to assessment loops, working closely with curriculum and data teams.',
   array['Product management','Learning design','Experimentation'],'2026-08-20'),
  ('CG-1033','Data Engineer','Data & Insights','Remote (India)','4-7 yrs',true,18000,30,
   'Build and run the pipelines behind programme reporting, from raw event streams to the dashboards state partners rely on.',
   array['Python','dbt','Airflow','Postgres'],'2026-08-22'),
  ('CG-1018','State Partnerships Lead','Government Relations','Bhopal','8-12 yrs',true,25000,30,
   'Own the relationship with the state education department, from MoU through to annual review.',
   array['Government relations','Negotiation','Public policy'],'2026-08-12'),
  ('CG-1027','Backend Engineer (Node.js)','Engineering','Remote (India)','3-6 yrs',false,15000,30,
   'Build the services behind SwiftChat at the scale of millions of daily learner conversations.',
   array['Node.js','TypeScript','Postgres','AWS'],'2026-08-30'),
  ('CG-1060','Data Analyst','Data & Insights','Noida','2-4 yrs',false,12000,30,
   'Turn programme data into the weekly numbers that decide where field teams go next.',
   array['SQL','Python','Visualisation'],'2026-09-02'),
  ('CG-1044','UX Designer','Design','Bengaluru','3-5 yrs',false,12000,30,
   'Design learner-facing flows for low-bandwidth Android devices used in low-literacy contexts.',
   array['Product design','Research','Accessibility'],'2026-08-18'),
  ('CG-1071','Instructional Designer','Content','Lucknow','2-5 yrs',false,10000,30,
   'Write and structure learning content for Grades 6-10 in Hindi and English.',
   array['Curriculum design','Hindi writing','Assessment'],'2026-09-04'),
  ('CG-1039','QA Engineer','Engineering','Noida','2-4 yrs',false,9000,30,
   'Own release quality across the SwiftChat Android app and the partner web console.',
   array['Test automation','Android','API testing'],'2026-08-25'),
  ('CG-1085','Field Coordinator','Programs','Patna','1-3 yrs',false,6000,90,
   'Run school-level implementation in your district: teacher onboarding, usage follow-up and monthly reporting.',
   array['Field operations','Teacher training','Reporting'],'2026-09-08')
on conflict (req_id) do nothing;
