-- =============================================================================
-- Migration 069: Seed Tamil Nadu District Stops and Transit Routes
--
-- Inserts standard district jurisdictions, major terminal stops with PostGIS
-- coordinates, and cross-district routes into public.districts, public.stops,
-- public.routes, and public.route_stops.
-- =============================================================================

-- 1. Ensure all major Tamil Nadu districts exist
INSERT INTO public.districts (name, code, state, is_active)
VALUES
  ('Chennai', 'CHE', 'Tamil Nadu', true),
  ('Coimbatore', 'CBE', 'Tamil Nadu', true),
  ('Krishnagiri', 'KRI', 'Tamil Nadu', true),
  ('Thanjavur', 'TNJ', 'Tamil Nadu', true),
  ('Madurai', 'MDU', 'Tamil Nadu', true),
  ('Salem', 'SLM', 'Tamil Nadu', true),
  ('Tiruppur', 'TUP', 'Tamil Nadu', true),
  ('Trichy', 'TRY', 'Tamil Nadu', true),
  ('Erode', 'ERD', 'Tamil Nadu', true)
ON CONFLICT (name) DO UPDATE SET is_active = true;

-- 2. Standardize existing Thanjai stops
UPDATE public.stops
SET district = 'Thanjavur',
    district_id = (SELECT id FROM public.districts WHERE name = 'Thanjavur' LIMIT 1)
WHERE district ILIKE '%thanj%';

-- 3. Insert standard terminal stops for all districts
INSERT INTO public.stops (name, code, district, district_id, location, is_active)
SELECT s.name, s.code, s.district, d.id, ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326), true
FROM (VALUES
  -- Chennai
  ('Puratchi Thalaivar Dr. M.G.R. Central', 'MAS', 'Chennai', 80.2757, 13.0827),
  ('Koyambedu (CMBT)', 'CMBT', 'Chennai', 80.2056, 13.0694),
  ('T. Nagar Bus Terminus', 'TNG', 'Chennai', 80.2341, 13.0418),
  ('Tambaram Sanatorium', 'TBM', 'Chennai', 80.1265, 12.9255),
  ('Guindy Industrial Estate', 'GDY', 'Chennai', 80.2025, 13.0067),
  ('Broadway Terminus', 'BWY', 'Chennai', 80.2872, 13.0878),
  ('Adyar Old Depot', 'ADY', 'Chennai', 80.2565, 13.0012),

  -- Coimbatore
  ('Gandhipuram Central Bus Stand', 'GDP', 'Coimbatore', 76.9673, 11.0168),
  ('Ukkadam Bus Terminus', 'UKD', 'Coimbatore', 76.9602, 10.9897),
  ('Singanallur Bus Stand', 'SGL', 'Coimbatore', 77.0264, 10.9984),
  ('Coimbatore Railway Junction', 'CBE-JN', 'Coimbatore', 76.9649, 10.9979),
  ('RS Puram Head Post Office', 'RSP', 'Coimbatore', 76.9482, 11.0089),
  ('Coimbatore International Airport', 'CJB', 'Coimbatore', 77.0434, 11.0300),
  ('Saravanampatti IT Corridor', 'SVP', 'Coimbatore', 76.9959, 11.0824),

  -- Krishnagiri
  ('Hosur Bus Terminus', 'HSR-01', 'Krishnagiri', 77.8253, 12.7409),

  -- Madurai
  ('Mattuthavani Integrated Bus Terminus', 'MDU-MIBT', 'Madurai', 78.1528, 9.9329),
  ('Arapalayam Bus Stand', 'MDU-ARP', 'Madurai', 78.1065, 9.9348),
  ('Periyar Bus Stand', 'MDU-PER', 'Madurai', 78.1154, 9.9171),
  ('Madurai Junction Railway Station', 'MDU-JN', 'Madurai', 78.1102, 9.9185),
  ('Thiruparankundram Temple Stop', 'MDU-TPK', 'Madurai', 78.0705, 9.8804),

  -- Salem
  ('Salem New Bus Stand', 'SLM-NBS', 'Salem', 78.1408, 11.6667),
  ('Salem Old Bus Stand', 'SLM-OBS', 'Salem', 78.1578, 11.6582),
  ('Salem Junction Railway Station', 'SLM-JN', 'Salem', 78.1165, 11.6698),
  ('Shevapet Commercial Centre', 'SLM-SHV', 'Salem', 78.1442, 11.6508),

  -- Tiruppur
  ('Tiruppur Old Bus Stand', 'TUP-OBS', 'Tiruppur', 77.3411, 11.1085),
  ('Tiruppur New Bus Stand', 'TUP-NBS', 'Tiruppur', 77.3482, 11.1278),
  ('Tiruppur Railway Station', 'TUP-JN', 'Tiruppur', 77.3458, 11.1118),

  -- Trichy
  ('Central Bus Stand Trichy', 'TRY-CBS', 'Trichy', 78.6872, 10.7955),
  ('Chatram Bus Stand', 'TRY-CHB', 'Trichy', 78.6946, 10.8324),
  ('Tiruchirappalli Junction', 'TRY-JN', 'Trichy', 78.6865, 10.7936),

  -- Erode
  ('Erode Central Bus Terminus', 'ERD-CBT', 'Erode', 77.7172, 11.3410),
  ('Erode Junction Railway Station', 'ERD-JN', 'Erode', 77.7275, 11.3342),
  ('Brough Road Commercial Market', 'ERD-BRM', 'Erode', 77.7240, 11.3465)
) AS s(name, code, district, lng, lat)
LEFT JOIN public.districts d ON d.name = s.district
ON CONFLICT (code) DO UPDATE
SET district = EXCLUDED.district,
    district_id = EXCLUDED.district_id,
    location = EXCLUDED.location,
    is_active = true;
