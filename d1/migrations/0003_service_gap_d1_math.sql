CREATE VIEW v_service_gap AS
WITH pairs AS (
  SELECT
    c.id AS community_id,
    c.name AS community_name,
    c.lat AS community_lat,
    c.lng AS community_lng,
    p.type AS service_type,
    p.id AS provider_id,
    p.name AS provider_name,
    p.lat AS provider_lat,
    p.lng AS provider_lng,
    2 * 6371 * asin(sqrt(
      sin(radians(p.lat - c.lat) / 2) * sin(radians(p.lat - c.lat) / 2) +
      cos(radians(c.lat)) * cos(radians(p.lat)) * sin(radians(p.lng - c.lng) / 2) * sin(radians(p.lng - c.lng) / 2)
    )) AS km
  FROM "Group" c
  CROSS JOIN "Provider" p
  WHERE c.type = 'community' AND c.lat IS NOT NULL AND p.verified
),
ranked AS (
  SELECT *, row_number() OVER (PARTITION BY community_id, service_type ORDER BY km) AS rn
  FROM pairs
)
SELECT
  community_id,
  community_name,
  community_lat,
  community_lng,
  service_type,
  provider_id,
  provider_name,
  provider_lat,
  provider_lng,
  round(km, 1) AS distance_km,
  round((km * 1.3 / 80 * 60)) AS travel_minutes
FROM ranked
WHERE rn = 1;
