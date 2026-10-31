-- SQLite equivalents of the PostgreSQL insight views. Provider-facing cells
-- keep the minimum size of five enforced in SQL.

CREATE VIEW v_appointment_outcome AS
SELECT
  a.id,
  pl."providerId" AS provider_id,
  a."communityId" AS community_id,
  g.name AS community_name,
  a.type,
  date(a."startsAt", '-6 days', 'weekday 1') AS week,
  (a.status = 'missed') AS missed,
  CASE
    WHEN max(r.recipient = 'carer' AND r."deliveryStatus" IN ('sent', 'delivered')) THEN 'carer'
    WHEN max(r.channel = 'sms' AND r."deliveryStatus" IN ('sent', 'delivered')) THEN 'sms'
    WHEN max(r.channel = 'push' AND r."deliveryStatus" IN ('sent', 'delivered')) THEN 'push'
    ELSE 'none'
  END AS reminder_category
FROM "Appointment" a
JOIN "PatientLink" pl ON pl.id = a."patientLinkId"
LEFT JOIN "Group" g ON g.id = a."communityId"
LEFT JOIN "Reminder" r ON r."appointmentId" = a.id
WHERE a.status IN ('attended', 'missed')
GROUP BY a.id, pl."providerId", g.name;

CREATE VIEW v_dna_weekly AS
SELECT
  provider_id,
  week,
  community_id,
  coalesce(community_name, 'All communities') AS community_name,
  CASE WHEN count(*) < 5 THEN NULL ELSE count(*) END AS total,
  CASE WHEN count(*) < 5 THEN NULL ELSE count(*) FILTER (WHERE missed) END AS missed,
  CASE WHEN count(*) < 5 THEN NULL
       ELSE round(100.0 * count(*) FILTER (WHERE missed) / count(*), 1) END AS dna_rate,
  count(*) < 5 AS suppressed
FROM v_appointment_outcome
GROUP BY provider_id, week, community_id, community_name
UNION ALL
SELECT
  provider_id,
  week,
  NULL AS community_id,
  'All communities' AS community_name,
  CASE WHEN count(*) < 5 THEN NULL ELSE count(*) END AS total,
  CASE WHEN count(*) < 5 THEN NULL ELSE count(*) FILTER (WHERE missed) END AS missed,
  CASE WHEN count(*) < 5 THEN NULL
       ELSE round(100.0 * count(*) FILTER (WHERE missed) / count(*), 1) END AS dna_rate,
  count(*) < 5 AS suppressed
FROM v_appointment_outcome
GROUP BY provider_id, week;

CREATE VIEW v_dna_by_type AS
SELECT
  provider_id,
  type,
  CASE WHEN count(*) < 5 THEN NULL ELSE count(*) END AS total,
  CASE WHEN count(*) < 5 THEN NULL ELSE count(*) FILTER (WHERE missed) END AS missed,
  CASE WHEN count(*) < 5 THEN NULL
       ELSE round(100.0 * count(*) FILTER (WHERE missed) / count(*), 1) END AS dna_rate,
  count(*) < 5 AS suppressed
FROM v_appointment_outcome
GROUP BY provider_id, type;

CREATE VIEW v_dna_by_community AS
SELECT
  provider_id,
  community_id,
  community_name,
  CASE WHEN count(*) < 5 THEN NULL ELSE count(*) END AS total,
  CASE WHEN count(*) < 5 THEN NULL ELSE count(*) FILTER (WHERE missed) END AS missed,
  CASE WHEN count(*) < 5 THEN NULL
       ELSE round(100.0 * count(*) FILTER (WHERE missed) / count(*), 1) END AS dna_rate,
  count(*) < 5 AS suppressed
FROM v_appointment_outcome
GROUP BY provider_id, community_id, community_name;

CREATE VIEW v_reminder_effectiveness AS
SELECT
  provider_id,
  reminder_category,
  CASE WHEN count(*) < 5 THEN NULL ELSE count(*) END AS total,
  CASE WHEN count(*) < 5 THEN NULL ELSE count(*) FILTER (WHERE NOT missed) END AS attended,
  CASE WHEN count(*) < 5 THEN NULL
       ELSE round(100.0 * count(*) FILTER (WHERE NOT missed) / count(*), 1) END AS attendance_rate,
  count(*) < 5 AS suppressed
FROM v_appointment_outcome
GROUP BY provider_id, reminder_category;

CREATE VIEW v_weekly_active AS
SELECT
  "communityId" AS community_id,
  date(day, '-6 days', 'weekday 1') AS week,
  count(DISTINCT "userId") AS active_members
FROM "Activity"
GROUP BY "communityId", date(day, '-6 days', 'weekday 1');

CREATE VIEW v_event_rsvps AS
SELECT
  e.id AS event_id,
  e."communityId" AS community_id,
  e.title,
  e.category,
  e."startsAt" AS starts_at,
  count(r.id) FILTER (WHERE r.response = 'going') AS going,
  count(r.id) FILTER (WHERE r.response = 'maybe') AS maybe,
  count(r.id) FILTER (WHERE r.response = 'no') AS declined
FROM "Event" e
LEFT JOIN "Rsvp" r ON r."eventId" = e.id
WHERE e."cancelledAt" IS NULL
GROUP BY e.id;

CREATE VIEW v_post_approvals AS
SELECT
  "communityId" AS community_id,
  date("createdAt", '-6 days', 'weekday 1') AS week,
  count(*) AS submitted,
  count(*) FILTER (WHERE status = 'published') AS published,
  count(*) FILTER (WHERE status = 'rejected') AS rejected,
  count(*) FILTER (WHERE status = 'pending') AS pending,
  round(avg((julianday("decidedAt") - julianday("createdAt")) * 24)
        FILTER (WHERE "decidedAt" IS NOT NULL AND "decidedById" <> "authorId"), 1)
    AS avg_hours_to_decision
FROM "Post"
GROUP BY "communityId", date("createdAt", '-6 days', 'weekday 1');
