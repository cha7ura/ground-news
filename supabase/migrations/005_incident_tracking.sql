-- Ground News Sri Lanka - Location Coordinates & Crime Tag Support
-- Migration 005
--
-- Adds geographic coordinates to location tags for map visualization.
-- Uses the existing tags system: crime-category tags (drugs, shootings)
-- cross-referenced with location tags to plot incidents on a map.
--
-- Flow: article tagged "drugs" + tagged "Negombo" (with lat/lng)
--       → plot on map at Negombo's coordinates.

-- ============================================
-- ADD COORDINATES TO TAGS TABLE
-- For location-type tags, store lat/lng for map display.
-- ============================================
ALTER TABLE tags ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS district TEXT;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS province TEXT;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Index for location-based tag queries
CREATE INDEX IF NOT EXISTS idx_tags_geo ON tags(latitude, longitude) WHERE latitude IS NOT NULL AND type = 'location';
CREATE INDEX IF NOT EXISTS idx_tags_district ON tags(district) WHERE district IS NOT NULL;

-- ============================================
-- SRI_LANKA_LOCATIONS REFERENCE TABLE
-- Canonical locations with coordinates for geo-matching.
-- Used to auto-populate lat/lng on location tags.
-- ============================================
CREATE TABLE IF NOT EXISTS sri_lanka_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_si TEXT,
  slug TEXT UNIQUE NOT NULL,
  district TEXT,
  province TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  type TEXT DEFAULT 'city' CHECK (type IN ('city', 'town', 'district_capital', 'province_capital', 'national_capital', 'area', 'port', 'airport'))
);

CREATE INDEX IF NOT EXISTS idx_sl_locations_slug ON sri_lanka_locations(slug);
CREATE INDEX IF NOT EXISTS idx_sl_locations_district ON sri_lanka_locations(district);
CREATE INDEX IF NOT EXISTS idx_sl_locations_name ON sri_lanka_locations(name);

-- ============================================
-- SEED: Sri Lankan locations with coordinates
-- ============================================

-- Western Province
INSERT INTO sri_lanka_locations (name, name_si, slug, district, province, latitude, longitude, type) VALUES
  ('Colombo', 'කොළඹ', 'colombo', 'Colombo', 'Western', 6.9271, 79.8612, 'national_capital'),
  ('Colombo Fort', 'කොළඹ කොටුව', 'colombo-fort', 'Colombo', 'Western', 6.9344, 79.8428, 'area'),
  ('Dehiwala-Mount Lavinia', 'දෙහිවල-ගල්කිස්ස', 'dehiwala-mount-lavinia', 'Colombo', 'Western', 6.8560, 79.8650, 'city'),
  ('Moratuwa', 'මොරටුව', 'moratuwa', 'Colombo', 'Western', 6.7730, 79.8816, 'city'),
  ('Nugegoda', 'නුගේගොඩ', 'nugegoda', 'Colombo', 'Western', 6.8720, 79.8900, 'town'),
  ('Maharagama', 'මහරගම', 'maharagama', 'Colombo', 'Western', 6.8480, 79.9260, 'town'),
  ('Kotte', 'කෝට්ටේ', 'kotte', 'Colombo', 'Western', 6.8910, 79.9070, 'city'),
  ('Sri Jayawardenepura Kotte', 'ශ්‍රී ජයවර්ධනපුර කෝට්ටේ', 'sri-jayawardenepura-kotte', 'Colombo', 'Western', 6.8868, 79.9187, 'city'),
  ('Piliyandala', 'පිළියන්දල', 'piliyandala', 'Colombo', 'Western', 6.8012, 79.9222, 'town'),
  ('Borella', 'බොරැල්ල', 'borella', 'Colombo', 'Western', 6.9143, 79.8780, 'area'),
  ('Pettah', 'පිටකොටුව', 'pettah', 'Colombo', 'Western', 6.9376, 79.8500, 'area'),
  ('Wellawatte', 'වැල්ලවත්ත', 'wellawatte', 'Colombo', 'Western', 6.8740, 79.8610, 'area'),
  ('Bambalapitiya', 'බම්බලපිටිය', 'bambalapitiya', 'Colombo', 'Western', 6.8847, 79.8560, 'area'),
  ('Kollupitiya', 'කොල්ලුපිටිය', 'kollupitiya', 'Colombo', 'Western', 6.8980, 79.8560, 'area'),
  ('Maradana', 'මරදාන', 'maradana', 'Colombo', 'Western', 6.9289, 79.8700, 'area'),
  ('Kotahena', 'කොටහේන', 'kotahena', 'Colombo', 'Western', 6.9470, 79.8600, 'area'),
  ('Kelaniya', 'කැලණිය', 'kelaniya', 'Colombo', 'Western', 6.9553, 79.9213, 'town'),
  ('Kaduwela', 'කඩුවෙල', 'kaduwela', 'Colombo', 'Western', 6.9320, 79.9830, 'town'),
  ('Gampaha', 'ගම්පහ', 'gampaha', 'Gampaha', 'Western', 7.0917, 80.0000, 'district_capital'),
  ('Negombo', 'මීගමුව', 'negombo', 'Gampaha', 'Western', 7.2106, 79.8381, 'city'),
  ('Ja-Ela', 'ජා-ඇල', 'ja-ela', 'Gampaha', 'Western', 7.0751, 79.8918, 'town'),
  ('Wattala', 'වත්තල', 'wattala', 'Gampaha', 'Western', 6.9892, 79.8900, 'town'),
  ('Kadawatha', 'කඩවත', 'kadawatha', 'Gampaha', 'Western', 6.9800, 79.9500, 'town'),
  ('Minuwangoda', 'මිනුවන්ගොඩ', 'minuwangoda', 'Gampaha', 'Western', 7.1680, 79.9530, 'town'),
  ('Katunayake', 'කටුනායක', 'katunayake', 'Gampaha', 'Western', 7.1690, 79.8840, 'airport'),
  ('Kalutara', 'කළුතර', 'kalutara', 'Kalutara', 'Western', 6.5854, 79.9607, 'district_capital'),
  ('Panadura', 'පානදුර', 'panadura', 'Kalutara', 'Western', 6.7130, 79.9070, 'city'),
  ('Beruwala', 'බේරුවල', 'beruwala', 'Kalutara', 'Western', 6.4790, 79.9830, 'town'),
  ('Horana', 'හොරණ', 'horana', 'Kalutara', 'Western', 6.7160, 80.0620, 'town')
ON CONFLICT (slug) DO NOTHING;

-- Central Province
INSERT INTO sri_lanka_locations (name, name_si, slug, district, province, latitude, longitude, type) VALUES
  ('Kandy', 'මහනුවර', 'kandy', 'Kandy', 'Central', 7.2906, 80.6337, 'province_capital'),
  ('Peradeniya', 'පේරාදෙණිය', 'peradeniya', 'Kandy', 'Central', 7.2594, 80.5940, 'town'),
  ('Katugastota', 'කටුගස්තොට', 'katugastota', 'Kandy', 'Central', 7.3250, 80.6250, 'town'),
  ('Matale', 'මාතලේ', 'matale', 'Matale', 'Central', 7.4699, 80.6234, 'district_capital'),
  ('Dambulla', 'දඹුල්ල', 'dambulla', 'Matale', 'Central', 7.8742, 80.6511, 'city'),
  ('Sigiriya', 'සීගිරිය', 'sigiriya', 'Matale', 'Central', 7.9570, 80.7600, 'town'),
  ('Nuwara Eliya', 'නුවරඑලිය', 'nuwara-eliya', 'Nuwara Eliya', 'Central', 6.9497, 80.7891, 'district_capital'),
  ('Hatton', 'හැටන්', 'hatton', 'Nuwara Eliya', 'Central', 6.8917, 80.5958, 'town')
ON CONFLICT (slug) DO NOTHING;

-- Southern Province
INSERT INTO sri_lanka_locations (name, name_si, slug, district, province, latitude, longitude, type) VALUES
  ('Galle', 'ගාල්ල', 'galle', 'Galle', 'Southern', 6.0535, 80.2210, 'province_capital'),
  ('Unawatuna', 'උනවටුන', 'unawatuna', 'Galle', 'Southern', 6.0098, 80.2497, 'town'),
  ('Hikkaduwa', 'හික්කඩුව', 'hikkaduwa', 'Galle', 'Southern', 6.1395, 80.1043, 'town'),
  ('Matara', 'මාතර', 'matara', 'Matara', 'Southern', 5.9485, 80.5353, 'district_capital'),
  ('Weligama', 'වැලිගම', 'weligama', 'Matara', 'Southern', 5.9747, 80.4297, 'town'),
  ('Hambantota', 'හම්බන්තොට', 'hambantota', 'Hambantota', 'Southern', 6.1429, 81.1212, 'district_capital'),
  ('Tangalle', 'තංගල්ල', 'tangalle', 'Hambantota', 'Southern', 6.0234, 80.7948, 'town'),
  ('Tissamaharama', 'තිස්සමහාරාමය', 'tissamaharama', 'Hambantota', 'Southern', 6.2843, 81.2878, 'town'),
  ('Ambalangoda', 'අම්බලන්ගොඩ', 'ambalangoda', 'Galle', 'Southern', 6.2354, 80.0538, 'town')
ON CONFLICT (slug) DO NOTHING;

-- Northern Province
INSERT INTO sri_lanka_locations (name, name_si, slug, district, province, latitude, longitude, type) VALUES
  ('Jaffna', 'යාපනය', 'jaffna', 'Jaffna', 'Northern', 9.6615, 80.0255, 'province_capital'),
  ('Point Pedro', 'පේදුරුතුඩුව', 'point-pedro', 'Jaffna', 'Northern', 9.8164, 80.2305, 'town'),
  ('Kilinochchi', 'කිලිනොච්චිය', 'kilinochchi', 'Kilinochchi', 'Northern', 9.3803, 80.3770, 'district_capital'),
  ('Mullaitivu', 'මුලතිව්', 'mullaitivu', 'Mullaitivu', 'Northern', 9.2671, 80.8142, 'district_capital'),
  ('Mannar', 'මන්නාරම', 'mannar', 'Mannar', 'Northern', 8.9810, 79.9043, 'district_capital'),
  ('Vavuniya', 'වව්නියාව', 'vavuniya', 'Vavuniya', 'Northern', 8.7514, 80.4971, 'district_capital')
ON CONFLICT (slug) DO NOTHING;

-- Eastern Province
INSERT INTO sri_lanka_locations (name, name_si, slug, district, province, latitude, longitude, type) VALUES
  ('Trincomalee', 'ත්‍රිකුණාමලය', 'trincomalee', 'Trincomalee', 'Eastern', 8.5874, 81.2152, 'province_capital'),
  ('Batticaloa', 'මඩකලපුව', 'batticaloa', 'Batticaloa', 'Eastern', 7.7310, 81.6747, 'district_capital'),
  ('Ampara', 'අම්පාර', 'ampara', 'Ampara', 'Eastern', 7.3061, 81.6724, 'district_capital'),
  ('Kalmunai', 'කල්මුනේ', 'kalmunai', 'Ampara', 'Eastern', 7.4136, 81.8210, 'city'),
  ('Arugam Bay', 'අරුගම් බේ', 'arugam-bay', 'Ampara', 'Eastern', 6.8402, 81.8344, 'town')
ON CONFLICT (slug) DO NOTHING;

-- North Western Province
INSERT INTO sri_lanka_locations (name, name_si, slug, district, province, latitude, longitude, type) VALUES
  ('Kurunegala', 'කුරුණෑගල', 'kurunegala', 'Kurunegala', 'North Western', 7.4868, 80.3623, 'province_capital'),
  ('Puttalam', 'පුත්තලම', 'puttalam', 'Puttalam', 'North Western', 8.0362, 79.8283, 'district_capital'),
  ('Chilaw', 'හලාවත', 'chilaw', 'Puttalam', 'North Western', 7.5757, 79.7953, 'city'),
  ('Kuliyapitiya', 'කුලියාපිටිය', 'kuliyapitiya', 'Kurunegala', 'North Western', 7.4700, 80.0422, 'town')
ON CONFLICT (slug) DO NOTHING;

-- North Central Province
INSERT INTO sri_lanka_locations (name, name_si, slug, district, province, latitude, longitude, type) VALUES
  ('Anuradhapura', 'අනුරාධපුරය', 'anuradhapura', 'Anuradhapura', 'North Central', 8.3114, 80.4037, 'province_capital'),
  ('Polonnaruwa', 'පොළොන්නරුව', 'polonnaruwa', 'Polonnaruwa', 'North Central', 7.9403, 81.0188, 'district_capital'),
  ('Medawachchiya', 'මැදවච්චිය', 'medawachchiya', 'Anuradhapura', 'North Central', 8.5379, 80.4929, 'town')
ON CONFLICT (slug) DO NOTHING;

-- Uva Province
INSERT INTO sri_lanka_locations (name, name_si, slug, district, province, latitude, longitude, type) VALUES
  ('Badulla', 'බදුල්ල', 'badulla', 'Badulla', 'Uva', 6.9934, 81.0550, 'province_capital'),
  ('Bandarawela', 'බණ්ඩාරවෙල', 'bandarawela', 'Badulla', 'Uva', 6.8290, 80.9880, 'city'),
  ('Ella', 'ඇල්ල', 'ella', 'Badulla', 'Uva', 6.8667, 81.0466, 'town'),
  ('Monaragala', 'මොණරාගල', 'monaragala', 'Monaragala', 'Uva', 6.8731, 81.3509, 'district_capital'),
  ('Wellawaya', 'වැල්ලවාය', 'wellawaya', 'Monaragala', 'Uva', 6.7372, 81.1031, 'town')
ON CONFLICT (slug) DO NOTHING;

-- Sabaragamuwa Province
INSERT INTO sri_lanka_locations (name, name_si, slug, district, province, latitude, longitude, type) VALUES
  ('Ratnapura', 'රත්නපුර', 'ratnapura', 'Ratnapura', 'Sabaragamuwa', 6.6828, 80.3992, 'province_capital'),
  ('Balangoda', 'බලංගොඩ', 'balangoda', 'Ratnapura', 'Sabaragamuwa', 6.6467, 80.6939, 'town'),
  ('Kegalle', 'කෑගල්ල', 'kegalle', 'Kegalle', 'Sabaragamuwa', 7.2514, 80.3469, 'district_capital'),
  ('Mawanella', 'මාවනැල්ල', 'mawanella', 'Kegalle', 'Sabaragamuwa', 7.2528, 80.4500, 'town')
ON CONFLICT (slug) DO NOTHING;

-- Additional key towns
INSERT INTO sri_lanka_locations (name, name_si, slug, district, province, latitude, longitude, type) VALUES
  ('Embilipitiya', 'ඇඹිලිපිටිය', 'embilipitiya', 'Ratnapura', 'Sabaragamuwa', 6.3292, 80.8489, 'town'),
  ('Avissawella', 'අවිස්සාවේල්ල', 'avissawella', 'Colombo', 'Western', 6.9533, 80.2167, 'town'),
  ('Wennappuwa', 'වෙන්නප්පුව', 'wennappuwa', 'Puttalam', 'North Western', 7.3494, 79.8472, 'town'),
  ('Peliyagoda', 'පැලියගොඩ', 'peliyagoda', 'Gampaha', 'Western', 6.9650, 79.8830, 'town'),
  ('Battaramulla', 'බත්තරමුල්ල', 'battaramulla', 'Colombo', 'Western', 6.9000, 79.9180, 'area'),
  ('Rajagiriya', 'රාජගිරිය', 'rajagiriya', 'Colombo', 'Western', 6.9110, 79.8970, 'area'),
  ('Kiribathgoda', 'කිරිබත්ගොඩ', 'kiribathgoda', 'Gampaha', 'Western', 7.0280, 79.9270, 'town'),
  ('Kottawa', 'කොට්ටාව', 'kottawa', 'Colombo', 'Western', 6.8420, 79.9630, 'town'),
  ('Matugama', 'මතුගම', 'matugama', 'Kalutara', 'Western', 6.5160, 80.1130, 'town'),
  ('Aluthgama', 'අලුත්ගම', 'aluthgama', 'Kalutara', 'Western', 6.4310, 80.0020, 'town'),
  ('Welimada', 'වැලිමඩ', 'welimada', 'Badulla', 'Uva', 6.9000, 80.9167, 'town'),
  ('Haputale', 'හපුතලේ', 'haputale', 'Badulla', 'Uva', 6.7667, 80.9667, 'town'),
  ('Mahiyanganaya', 'මහියංගනය', 'mahiyanganaya', 'Badulla', 'Uva', 7.3300, 81.1167, 'town'),
  ('Kataragama', 'කතරගම', 'kataragama', 'Monaragala', 'Uva', 6.4164, 81.3300, 'town'),
  ('Bentota', 'බෙන්තොට', 'bentota', 'Galle', 'Southern', 6.4209, 80.0000, 'town'),
  ('Mirissa', 'මිරිස්ස', 'mirissa', 'Matara', 'Southern', 5.9472, 80.4578, 'town')
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- BACKFILL: Populate coordinates on existing location tags
-- from the sri_lanka_locations reference table.
-- ============================================
UPDATE tags t
SET
  latitude = sl.latitude,
  longitude = sl.longitude,
  district = sl.district,
  province = sl.province
FROM sri_lanka_locations sl
WHERE t.type = 'location'
  AND t.slug = sl.slug
  AND t.latitude IS NULL;

-- ============================================
-- FUNCTION: Get articles for a tag with location data for map
-- Used by crime/event tag pages to show timeline + map.
-- Cross-references crime-tag articles with their location tags.
-- ============================================
CREATE OR REPLACE FUNCTION get_tag_map_data(
  p_tag_slug TEXT,
  p_limit INT DEFAULT 200
)
RETURNS TABLE (
  article_id UUID,
  article_title TEXT,
  article_url TEXT,
  published_at TIMESTAMP,
  source_name TEXT,
  summary TEXT,
  location_tag_name TEXT,
  location_tag_slug TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  district TEXT,
  province TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id AS article_id,
    a.title AS article_title,
    a.url AS article_url,
    a.published_at,
    s.name AS source_name,
    a.summary,
    loc_tag.name AS location_tag_name,
    loc_tag.slug AS location_tag_slug,
    loc_tag.latitude,
    loc_tag.longitude,
    loc_tag.district,
    loc_tag.province
  FROM article_tags crime_at
  JOIN tags crime_tag ON crime_at.tag_id = crime_tag.id
  JOIN articles a ON crime_at.article_id = a.id
  JOIN sources s ON a.source_id = s.id
  -- Cross-join to find location tags on the same article
  JOIN article_tags loc_at ON loc_at.article_id = a.id
  JOIN tags loc_tag ON loc_at.tag_id = loc_tag.id
    AND loc_tag.type = 'location'
    AND loc_tag.latitude IS NOT NULL
  WHERE crime_tag.slug = p_tag_slug
  ORDER BY a.published_at DESC NULLS LAST
  LIMIT p_limit;
END;
$$;
