// Entity alias resolution for Sri Lankan news entities.
// Maps short names, abbreviations, and Sinhala forms to canonical English names.
// This file serves as the primary source; the entity_aliases DB table extends it at runtime.

import type { EntityType } from './types';

// Person aliases — politicians, public figures
const PERSON_ALIASES: Record<string, string> = {
  // President
  'akd': 'Anura Kumara Dissanayake',
  'anura': 'Anura Kumara Dissanayake',
  'anura kumara': 'Anura Kumara Dissanayake',
  'president dissanayake': 'Anura Kumara Dissanayake',
  'අනුර': 'Anura Kumara Dissanayake',
  'අනුර කුමාර': 'Anura Kumara Dissanayake',
  'අනුර කුමාර දිසානායක': 'Anura Kumara Dissanayake',
  // PM
  'harini': 'Harini Amarasuriya',
  'harini amarasuriya': 'Harini Amarasuriya',
  'pm amarasuriya': 'Harini Amarasuriya',
  'හරිණි': 'Harini Amarasuriya',
  'හරිණි අමරසූරිය': 'Harini Amarasuriya',
  // Former presidents
  'ranil': 'Ranil Wickremesinghe',
  'rw': 'Ranil Wickremesinghe',
  'ranil wickremesinghe': 'Ranil Wickremesinghe',
  'රනිල්': 'Ranil Wickremesinghe',
  'රනිල් වික්‍රමසිංහ': 'Ranil Wickremesinghe',
  'gotabaya': 'Gotabaya Rajapaksa',
  'gota': 'Gotabaya Rajapaksa',
  'gr': 'Gotabaya Rajapaksa',
  'ගෝඨාභය': 'Gotabaya Rajapaksa',
  'mahinda': 'Mahinda Rajapaksa',
  'mr': 'Mahinda Rajapaksa',
  'මහින්ද': 'Mahinda Rajapaksa',
  'මහින්ද රාජපක්ෂ': 'Mahinda Rajapaksa',
  // Opposition
  'sajith': 'Sajith Premadasa',
  'sajith premadasa': 'Sajith Premadasa',
  'සජිත්': 'Sajith Premadasa',
  'සජිත් ප්‍රේමදාස': 'Sajith Premadasa',
  // Other politicians
  'basil': 'Basil Rajapaksa',
  'namal': 'Namal Rajapaksa',
  'nimal siripala': 'Nimal Siripala de Silva',
  'dinesh': 'Dinesh Gunawardena',
  'gl peiris': 'G. L. Peiris',
  'vijitha herath': 'Vijitha Herath',
};

// Organization aliases
const ORG_ALIASES: Record<string, string> = {
  'slpp': 'Sri Lanka Podujana Peramuna',
  'pohottuwa': 'Sri Lanka Podujana Peramuna',
  'sjb': 'Samagi Jana Balawegaya',
  'unp': 'United National Party',
  'npp': "National People's Power",
  'jjb': "National People's Power",
  'jvp': 'Janatha Vimukthi Peramuna',
  'jvp/npp': "National People's Power",
  'slfp': 'Sri Lanka Freedom Party',
  'cbsl': 'Central Bank of Sri Lanka',
  'central bank': 'Central Bank of Sri Lanka',
  'මහ බැංකුව': 'Central Bank of Sri Lanka',
  'cid': 'Criminal Investigation Department',
  'stf': 'Special Task Force',
  'fcid': 'Financial Crimes Investigation Division',
  'tic': 'Terrorism Investigation Division',
  'imf': 'International Monetary Fund',
  'who': 'World Health Organization',
  'adb': 'Asian Development Bank',
};

// Location aliases (Sinhala → English canonical)
const LOCATION_ALIASES: Record<string, string> = {
  'කොළඹ': 'Colombo',
  'මීගමුව': 'Negombo',
  'ගාල්ල': 'Galle',
  'මහනුවර': 'Kandy',
  'මාතර': 'Matara',
  'කුරුණෑගල': 'Kurunegala',
  'රත්නපුර': 'Ratnapura',
  'අනුරාධපුර': 'Anuradhapura',
  'යාපනය': 'Jaffna',
  'බදුල්ල': 'Badulla',
  'ගම්පහ': 'Gampaha',
  'කළුතර': 'Kalutara',
  'හම්බන්තොට': 'Hambantota',
  'පොළොන්නරුව': 'Polonnaruwa',
  'ත්‍රිකුණාමලය': 'Trincomalee',
  'මඩකලපුව': 'Batticaloa',
  'නුවර එළිය': 'Nuwara Eliya',
  'කිලිනොච්චි': 'Kilinochchi',
  'මුලතිව්': 'Mullaitivu',
  'මන්නාරම': 'Mannar',
  'අම්පාර': 'Ampara',
  'මොණරාගල': 'Monaragala',
  'කෑගල්ල': 'Kegalle',
  'පුත්තලම': 'Puttalam',
  'වව්නියාව': 'Vavuniya',
};

// Lookup tables indexed by lowercase
const personLookup = Object.fromEntries(
  Object.entries(PERSON_ALIASES).map(([k, v]) => [k.toLowerCase(), v])
);
const orgLookup = Object.fromEntries(
  Object.entries(ORG_ALIASES).map(([k, v]) => [k.toLowerCase(), v])
);
const locationLookup = Object.fromEntries(
  Object.entries(LOCATION_ALIASES).map(([k, v]) => [k.toLowerCase(), v])
);

// Combined lookup for any type
const allAliases: Record<string, string> = {
  ...personLookup,
  ...orgLookup,
  ...locationLookup,
};

/**
 * Resolve an entity name to its canonical form.
 * Checks type-specific aliases first, then falls back to the combined map.
 * Returns the original name if no alias is found.
 */
export function resolveAlias(name: string, type?: EntityType): string {
  const key = name.trim().toLowerCase();

  if (type === 'person' && personLookup[key]) return personLookup[key];
  if (type === 'organization' && orgLookup[key]) return orgLookup[key];
  if (type === 'location' && locationLookup[key]) return locationLookup[key];

  return allAliases[key] || name.trim();
}

/**
 * Check if a name is a known alias (returns true if we have a mapping).
 */
export function isKnownAlias(name: string): boolean {
  return name.trim().toLowerCase() in allAliases;
}

// Export the raw maps for the DB seeding migration
export { PERSON_ALIASES, ORG_ALIASES, LOCATION_ALIASES };
