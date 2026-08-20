-- =============================================================================
-- 009: Read views that decode PostGIS geography columns into plain
-- {latitude, longitude} JSON, because PostgREST serializes geography columns
-- as WKB hex by default — not usable by a JS client without a PostGIS-aware
-- parser. All client reads of stop coordinates go through `stops_public`;
-- writes still target the base `stops` table using WKT (see
-- transformSubmit in apps/admin/src/pages/StopsPage.tsx and
-- StopInsert/StopUpdate usage in @sbt/supabase-client), since geography
-- columns require WKT/EWKT input, not JSON, on INSERT/UPDATE.
--
-- security_invoker = true (Postgres 15+, which hosted Supabase runs) makes
-- the view apply the *querying user's* RLS policies rather than the view
-- owner's — so `stops_public` inherits exactly the same access rules as the
-- `stops` table itself (migration 007), just with decoded coordinates.
-- =============================================================================

create view stops_public
with (security_invoker = true)
as
select
  id,
  name,
  code,
  district,
  json_build_object(
    'latitude', st_y(location::geometry),
    'longitude', st_x(location::geometry)
  ) as location,
  created_at,
  updated_at
from stops;

grant select on stops_public to anon, authenticated;
