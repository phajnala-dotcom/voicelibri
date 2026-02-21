/**
 * Soundscape Module — Catalog Loader
 *
 * Parses the voicelibri_assets_catalog.csv and builds SoundAsset[]
 * for ambient/SFX and music asset search. CSV columns:
 *   FileID, Filename, Description, Keywords, Duration,
 *   Type, Category, SubCategory, Location,
 *   Microphone, TrackYear, RecMedium, FilePath
 *
 * The Type column determines SoundAsset.type ('ambient' or 'music').
 * Filenames may contain commas — proper RFC 4180 CSV parsing required.
 */

import fs from 'fs';
import path from 'path';
import { CATALOG_CSV_PATH, ASSETS_ROOT } from './config.js';
import type { SoundAsset } from './types.js';

// ========================================
// CSV catalog cache
// ========================================

let cachedCatalog: SoundAsset[] | null = null;

// ========================================
// CSV parsing (RFC 4180)
// ========================================

/**
 * Parse a CSV line respecting quoted fields with commas/newlines.
 * Simple but correct for our catalog format.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ("") vs end of field
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip next quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current); // last field
  return fields;
}

/**
 * Parse duration string "MM:SS.mmm" to seconds.
 */
function parseDuration(durationStr: string): number | undefined {
  if (!durationStr) return undefined;
  const match = durationStr.match(/^(\d+):(\d+(?:\.\d+)?)$/);
  if (!match) return undefined;
  return parseInt(match[1]) * 60 + parseFloat(match[2]);
}

// ========================================
// Public API
// ========================================

/**
 * Load the ambient asset catalog from CSV.
 * Returns cached result if already loaded.
 *
 * @param csvPath - Override CSV path (defaults to config CATALOG_CSV_PATH)
 */
export function loadCatalog(csvPath?: string): SoundAsset[] {
  if (cachedCatalog) return cachedCatalog;

  const filePath = csvPath || CATALOG_CSV_PATH;
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ Catalog CSV not found: ${filePath}`);
    return [];
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    console.warn('⚠️ Catalog CSV is empty or has no data rows');
    return [];
  }

  // Parse header
  const header = parseCsvLine(lines[0]);
  const colIndex = (name: string) => header.findIndex(
    (h) => h.trim().toLowerCase() === name.toLowerCase()
  );

  const idxFileID = colIndex('FileID');
  const idxFilename = colIndex('Filename');
  const idxDescription = colIndex('Description');
  const idxKeywords = colIndex('Keywords');
  const idxDuration = colIndex('Duration');
  const idxType = colIndex('Type');
  const idxCategory = colIndex('Category');
  const idxSubCategory = colIndex('SubCategory');
  const idxFilePath = colIndex('FilePath');

  if (idxFileID === -1 || idxDescription === -1 || idxFilePath === -1) {
    console.error('⚠️ Catalog CSV missing required columns (FileID, Description, FilePath)');
    return [];
  }

  // Parse rows
  const assets: SoundAsset[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < header.length) continue;

    const fileId = fields[idxFileID]?.trim();
    const description = fields[idxDescription]?.trim() || '';
    const relPath = fields[idxFilePath]?.trim() || '';
    const category = fields[idxCategory]?.trim() || '';
    const subcategory = fields[idxSubCategory]?.trim() || '';

    if (!fileId || !relPath) continue;

    // Build absolute path
    const absPath = path.join(ASSETS_ROOT, relPath);

    // Parse keywords into array
    const keywordsRaw = fields[idxKeywords]?.trim() || '';
    const keywords = keywordsRaw
      .split(/\s+/)
      .filter((k) => k.length > 0)
      .map((k) => k.toLowerCase());

    // Parse duration
    const durationSec = parseDuration(fields[idxDuration]?.trim() || '');

    // Determine asset type from CSV Type column
    const rawType = (idxType !== -1 ? fields[idxType]?.trim() : '').toLowerCase();
    let assetType: 'ambient' | 'music' | 'sfx';
    if (rawType === 'music') {
      assetType = 'music';
    } else if (rawType === 'sfx') {
      assetType = 'sfx';
    } else {
      assetType = 'ambient'; // realistic, cinematic → ambient
    }

    // Derive genre/mood from category + subcategory + keywords
    const genre = [
      category.toLowerCase(),
      subcategory.toLowerCase(),
    ].filter(Boolean);

    assets.push({
      id: `${assetType}/${fileId}`,
      type: assetType,
      filePath: absPath,
      description,
      keywords,
      genre,
      mood: [], // Could be enriched by LLM Director later
      durationSec,
      category,
      subcategory,
    });
  }

  cachedCatalog = assets;
  const ambientCount = assets.filter((a) => a.type === 'ambient').length;
  const sfxCount = assets.filter((a) => a.type === 'sfx').length;
  const musicCount = assets.filter((a) => a.type === 'music').length;
  console.log(`📋 Loaded ${assets.length} assets from catalog (${ambientCount} ambient, ${sfxCount} SFX, ${musicCount} music)`);
  return assets;
}

/**
 * Clear the cached catalog (e.g. after catalog update).
 */
export function clearCatalogCache(): void {
  cachedCatalog = null;
}

/**
 * Get assets filtered by category.
 */
export function getAssetsByCategory(category: string): SoundAsset[] {
  const catalog = loadCatalog();
  return catalog.filter(
    (a) => a.category?.toLowerCase() === category.toLowerCase()
  );
}

/**
 * Get a specific asset by its FileID.
 * Accepts raw FileID, or prefixed id like 'ambient/xxx' or 'music/xxx'.
 */
export function getAssetById(fileId: string): SoundAsset | undefined {
  const catalog = loadCatalog();
  return catalog.find(
    (a) => a.id === fileId || a.id === `ambient/${fileId}` || a.id === `music/${fileId}` || a.id === `sfx/${fileId}`
  );
}

/**
 * Load only music assets from the catalog.
 * Convenience wrapper filtering by type === 'music'.
 */
export function loadMusicCatalog(): SoundAsset[] {
  return loadCatalog().filter((a) => a.type === 'music');
}

/**
 * Load only SFX assets from the catalog.
 * Convenience wrapper filtering by type === 'sfx'.
 */
export function loadSfxCatalog(): SoundAsset[] {
  return loadCatalog().filter((a) => a.type === 'sfx');
}
