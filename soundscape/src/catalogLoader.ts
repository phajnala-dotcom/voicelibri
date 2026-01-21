import fs from 'fs';
import path from 'path';
import type { SoundLibraryCatalog } from './types';

export function loadCatalogFromFile(catalogPath: string): SoundLibraryCatalog {
  const resolved = path.resolve(catalogPath);
  const raw = fs.readFileSync(resolved, 'utf8');
  return JSON.parse(raw) as SoundLibraryCatalog;
}
