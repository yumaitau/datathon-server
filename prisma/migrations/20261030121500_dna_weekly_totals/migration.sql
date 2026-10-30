-- Weekly DNA cells per community were often under the minimum cell size, so the
-- trend line also needs an all-communities total. Adds a by-community view.
DROP VIEW v_dna_weekly;

-- Missed-appointment trend: did-not-attend rate by week, per community and
-- across all communities (community_id IS NULL).
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
GROUP BY GROUPING SETS ((provider_id, week, community_id, community_name), (provider_id, week));

-- Missed-appointment rate by community.
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

