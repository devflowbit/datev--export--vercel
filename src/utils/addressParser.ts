/**
 * Address Parser Utility
 * Parses German/European addresses into components required by DATEV
 * 
 * Supports multiple address formats:
 * - "Street, PostalCode City" (standard German)
 * - "Street PostalCode City" (no comma)
 * - "Street City PostalCode" (inverted - common in some systems)
 * - "Street\tCity\tPostalCode" (tab-separated)
 */

import { AddressComponents } from '../models/DatevDocument.interface';

/**
 * Major European cities for city detection
 * Used when postal code is at the end (inverted format)
 */
const MAJOR_EUROPEAN_CITIES = new Set([
  // German cities (major)
  'münchen', 'munich', 'berlin', 'hamburg', 'frankfurt', 'köln', 'cologne', 'düsseldorf',
  'stuttgart', 'dortmund', 'essen', 'leipzig', 'bremen', 'dresden', 'hannover', 'nürnberg',
  'nuremberg', 'duisburg', 'bochum', 'wuppertal', 'bielefeld', 'bonn', 'münster', 'karlsruhe',
  'mannheim', 'augsburg', 'wiesbaden', 'gelsenkirchen', 'mönchengladbach', 'braunschweig',
  'chemnitz', 'kiel', 'aachen', 'halle', 'magdeburg', 'freiburg', 'krefeld', 'lübeck',
  'oberhausen', 'erfurt', 'mainz', 'rostock', 'kassel', 'hagen', 'hamm', 'saarbrücken',
  'mülheim', 'potsdam', 'ludwigshafen', 'oldenburg', 'leverkusen', 'osnabrück', 'solingen',
  'heidelberg', 'herne', 'neuss', 'darmstadt', 'paderborn', 'regensburg', 'ingolstadt',
  'würzburg', 'wolfsburg', 'fürth', 'ulm', 'heilbronn', 'pforzheim', 'göttingen', 'bottrop',
  'trier', 'recklinghausen', 'reutlingen', 'bremerhaven', 'koblenz', 'bergisch gladbach',
  'jena', 'remscheid', 'erlangen', 'moers', 'siegen', 'hildesheim', 'salzgitter',
  'bad berleburg', 'bad homburg', 'bad nauheim', 'bad vilbel', 'bad kreuznach',
  // Austrian cities
  'wien', 'vienna', 'graz', 'linz', 'salzburg', 'innsbruck',
  // Swiss cities
  'zürich', 'zurich', 'genf', 'geneva', 'basel', 'bern', 'lausanne',
  // Other major EU cities
  'amsterdam', 'rotterdam', 'paris', 'lyon', 'marseille', 'brüssel', 'brussels', 'bruxelles',
  'prag', 'prague', 'warschau', 'warsaw', 'budapest', 'kopenhagen', 'copenhagen',
  'stockholm', 'oslo', 'helsinki', 'dublin', 'london', 'manchester', 'birmingham',
  'madrid', 'barcelona', 'rom', 'rome', 'mailand', 'milan', 'milano', 'lissabon', 'lisbon',
  'athen', 'athens'
]);

/**
 * Check if a word looks like a city name
 */
function looksLikeCity(word: string): boolean {
  if (!word || word.length < 2) return false;
  const normalized = word.toLowerCase().trim();
  
  // Check against known cities
  if (MAJOR_EUROPEAN_CITIES.has(normalized)) return true;
  
  // Check for "Bad " prefix (common in German spa towns)
  if (normalized.startsWith('bad ')) return true;
  
  // Check for "Sankt " or "St. " prefix
  if (normalized.startsWith('sankt ') || normalized.startsWith('st. ')) return true;
  
  // City names typically start with uppercase and contain only letters/spaces/hyphens
  if (!/^[A-ZÄÖÜ][a-zäöüß]+(\s+[A-ZÄÖÜ]?[a-zäöüß]+)*$/.test(word)) return false;
  
  return true;
}

/**
 * Parse a German/European address string into DATEV-required components
 * 
 * Handles multiple formats:
 * - "Herrenwiese 10, 57319 Bad Berleburg, DE" → standard
 * - "Marienplatz 15 München 80331" → inverted (city before postal code)
 * - "Marienplatz 15\tMünchen\t80331" → tab-separated
 * 
 * @param address Raw address string
 * @returns Parsed address components
 */
export function parseAddress(address: string): AddressComponents {
  if (!address || address.trim() === '') {
    return {
      street: '',
      postalCode: '',
      city: '',
      country: 'DE' // Default to Germany
    };
  }

  const trimmedAddress = address.trim();

  // Check for tab-separated format first (e.g., "Street\tCity\tPostalCode")
  if (trimmedAddress.includes('\t')) {
    return parseTabSeparatedAddress(trimmedAddress);
  }

  // Extract country code (last 2-3 letters, often DE, AT, CH)
  const countryMatch = trimmedAddress.match(/[,\s]([A-Z]{2,3})\s*$/);
  const country = countryMatch ? countryMatch[1] : 'DE';

  // Remove country from address
  let addressWithoutCountry = trimmedAddress;
  if (countryMatch) {
    addressWithoutCountry = trimmedAddress.substring(0, countryMatch.index).trim();
  }

  // Remove trailing comma if present
  addressWithoutCountry = addressWithoutCountry.replace(/,\s*$/, '');

  // Find all postal codes (5 digits for DE/AT, 4 digits for CH, etc.)
  const postalCodeMatches = [...addressWithoutCountry.matchAll(/\b(\d{4,5})\b/g)];
  
  if (postalCodeMatches.length === 0) {
    // No postal code found - try to extract city anyway
    return parseAddressWithoutPostalCode(addressWithoutCountry, country);
  }

  // If only one postal code found
  if (postalCodeMatches.length === 1) {
    const postalCodeMatch = postalCodeMatches[0];
    const postalCode = postalCodeMatch[1];
    const postalCodeIndex = postalCodeMatch.index!;
    const postalCodeEnd = postalCodeIndex + postalCode.length;

    // Check what's before and after the postal code
    const beforePostalCode = addressWithoutCountry.substring(0, postalCodeIndex).trim().replace(/,\s*$/, '');
    const afterPostalCode = addressWithoutCountry.substring(postalCodeEnd).trim().replace(/^,\s*/, '');

    // Case 1: Standard format - postal code followed by city
    // "Herrenwiese 10, 57319 Bad Berleburg"
    if (afterPostalCode && afterPostalCode.length > 0) {
      return {
        street: beforePostalCode,
        postalCode,
        city: afterPostalCode,
        country
      };
    }

    // Case 2: Inverted format - postal code at the end
    // "Marienplatz 15 München 80331"
    // Need to extract city from the end of beforePostalCode
    return parseInvertedAddress(beforePostalCode, postalCode, country);
  }

  // Multiple postal codes - use the last one as THE postal code
  // (sometimes addresses have building numbers that look like postal codes)
  const lastMatch = postalCodeMatches[postalCodeMatches.length - 1];
  const postalCode = lastMatch[1];
  const postalCodeIndex = lastMatch.index!;
  const postalCodeEnd = postalCodeIndex + postalCode.length;

  const beforePostalCode = addressWithoutCountry.substring(0, postalCodeIndex).trim().replace(/,\s*$/, '');
  const afterPostalCode = addressWithoutCountry.substring(postalCodeEnd).trim().replace(/^,\s*/, '');

  if (afterPostalCode && afterPostalCode.length > 0) {
    return {
      street: beforePostalCode,
      postalCode,
      city: afterPostalCode,
      country
    };
  }

  return parseInvertedAddress(beforePostalCode, postalCode, country);
}

/**
 * Parse tab-separated address (common in spreadsheet exports)
 * Format: "Street\tCity\tPostalCode" or "Street\tPostalCode\tCity"
 */
function parseTabSeparatedAddress(address: string): AddressComponents {
  const parts = address.split('\t').map(p => p.trim()).filter(p => p.length > 0);
  
  // Extract country if present at the end
  let country = 'DE';
  if (parts.length > 0 && /^[A-Z]{2,3}$/.test(parts[parts.length - 1])) {
    country = parts.pop()!;
  }

  if (parts.length === 0) {
    return { street: '', postalCode: '', city: '', country };
  }

  if (parts.length === 1) {
    return { street: parts[0], postalCode: '', city: '', country };
  }

  if (parts.length === 2) {
    // Could be Street + City or Street + PostalCode
    const isPostalCode = /^\d{4,5}$/.test(parts[1]);
    if (isPostalCode) {
      return { street: parts[0], postalCode: parts[1], city: '', country };
    }
    return { street: parts[0], postalCode: '', city: parts[1], country };
  }

  // 3+ parts: Street, City, PostalCode OR Street, PostalCode, City
  const part1IsPostal = /^\d{4,5}$/.test(parts[1]);
  const part2IsPostal = /^\d{4,5}$/.test(parts[2]);

  if (part1IsPostal && !part2IsPostal) {
    // Street, PostalCode, City
    return { street: parts[0], postalCode: parts[1], city: parts.slice(2).join(' '), country };
  }
  
  if (part2IsPostal && !part1IsPostal) {
    // Street, City, PostalCode
    return { street: parts[0], postalCode: parts[2], city: parts[1], country };
  }

  // Default: assume Street, City, PostalCode
  return { street: parts[0], postalCode: parts[2] || '', city: parts[1], country };
}

/**
 * Parse address without postal code - try to identify city
 */
function parseAddressWithoutPostalCode(address: string, country: string): AddressComponents {
  // Split by comma or multiple spaces
  const parts = address.split(/,|\s{2,}/).map(p => p.trim()).filter(p => p.length > 0);
  
  if (parts.length <= 1) {
    return { street: address, postalCode: '', city: '', country };
  }

  // Last part might be city
  const lastPart = parts[parts.length - 1];
  if (looksLikeCity(lastPart)) {
    return {
      street: parts.slice(0, -1).join(', '),
      postalCode: '',
      city: lastPart,
      country
    };
  }

  return { street: address, postalCode: '', city: '', country };
}

/**
 * Parse inverted address format where postal code is at the end
 * "Marienplatz 15 München 80331" → extract city from before postal code
 */
function parseInvertedAddress(beforePostalCode: string, postalCode: string, country: string): AddressComponents {
  // Split the text before postal code into words
  const words = beforePostalCode.split(/\s+/);
  
  if (words.length <= 1) {
    // Only one word - must be street
    return { street: beforePostalCode, postalCode, city: '', country };
  }

  // Try to find the city by working backwards
  // Strategy 1: Check if last word(s) match known cities
  for (let cityWordCount = 3; cityWordCount >= 1; cityWordCount--) {
    if (words.length <= cityWordCount) continue;
    
    const potentialCity = words.slice(-cityWordCount).join(' ');
    const normalizedCity = potentialCity.toLowerCase();
    
    if (MAJOR_EUROPEAN_CITIES.has(normalizedCity)) {
      const street = words.slice(0, -cityWordCount).join(' ');
      return { street, postalCode, city: potentialCity, country };
    }
  }

  // Strategy 2: Heuristic - look for uppercase word(s) that look like city names
  // Work backwards from the end
  let cityStartIndex = -1;
  
  for (let i = words.length - 1; i >= 1; i--) {
    const word = words[i];
    
    // Check if this word looks like start of a city name
    if (/^[A-ZÄÖÜ][a-zäöüß]+$/.test(word) || word.toLowerCase().startsWith('bad ')) {
      // Could be a city - but check if previous word is a number (street number)
      const prevWord = words[i - 1];
      if (/^\d+[a-zA-Z]?$/.test(prevWord)) {
        // Previous word is street number - this is likely city start
        cityStartIndex = i;
        break;
      }
    }
  }

  if (cityStartIndex > 0) {
    const street = words.slice(0, cityStartIndex).join(' ');
    const city = words.slice(cityStartIndex).join(' ');
    return { street, postalCode, city, country };
  }

  // Strategy 3: If nothing found, assume last capitalized word(s) are city
  // Find the last word that starts with uppercase
  let lastUppercaseIndex = -1;
  for (let i = words.length - 1; i >= 1; i--) {
    if (/^[A-ZÄÖÜ]/.test(words[i])) {
      lastUppercaseIndex = i;
      // Check if this could be a multi-word city (e.g., "Bad Berleburg")
      if (i > 0 && /^[A-ZÄÖÜ]/.test(words[i - 1]) && !/^\d/.test(words[i - 1])) {
        continue; // Keep looking for start of city name
      }
      break;
    }
  }

  if (lastUppercaseIndex > 0) {
    const street = words.slice(0, lastUppercaseIndex).join(' ');
    const city = words.slice(lastUppercaseIndex).join(' ');
    return { street, postalCode, city, country };
  }

  // Fallback: Put everything in street
  return { street: beforePostalCode, postalCode, city: '', country };
}

/**
 * Extract street from address
 */
export function extractStreet(address: string): string {
  return parseAddress(address).street;
}

/**
 * Extract postal code from address
 */
export function extractPostalCode(address: string): string {
  return parseAddress(address).postalCode;
}

/**
 * Extract city from address
 */
export function extractCity(address: string): string {
  return parseAddress(address).city;
}

/**
 * Extract country from address
 */
export function extractCountry(address: string): string {
  return parseAddress(address).country;
}

/**
 * Validate if address has all required components
 */
export function validateAddress(address: AddressComponents): { valid: boolean; missingFields: string[] } {
  const missingFields: string[] = [];

  if (!address.street || address.street.trim() === '') {
    missingFields.push('street');
  }
  if (!address.postalCode || address.postalCode.trim() === '') {
    missingFields.push('postalCode');
  }
  if (!address.city || address.city.trim() === '') {
    missingFields.push('city');
  }
  if (!address.country || address.country.trim() === '') {
    missingFields.push('country');
  }

  return {
    valid: missingFields.length === 0,
    missingFields
  };
}

/**
 * Validate German postal code format (5 digits)
 */
export function validatePostalCode(postalCode: string): boolean {
  return /^\d{5}$/.test(postalCode);
}

/**
 * Validate country code format (ISO 3166-1 Alpha-2)
 */
export function validateCountryCode(countryCode: string): boolean {
  return /^[A-Z]{2}$/.test(countryCode);
}
