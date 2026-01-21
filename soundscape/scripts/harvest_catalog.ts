import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

interface ManifestItem {
  id: string;
  url: string;
  license: string;
  source: string;
  type: 'music' | 'ambient';
  tags?: string[];
  mood?: string[];
  recommendedVolumeDb?: number;
}

interface Manifest {
  items: ManifestItem[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const ASSETS_DIR = path.join(ROOT, 'assets');
const MANIFEST_PATH = path.join(ASSETS_DIR, 'manifest.json');
const CATALOG_PATH = path.join(ASSETS_DIR, 'catalog.json');

function downloadFile(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    const needsCookie = url.includes('freesound.org');
    const cookie = process.env.FREESOUND_COOKIE;
    const headers = needsCookie && cookie ? { Cookie: cookie } : undefined;

    const request = https.get(url, { headers }, response => {
        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(`Download failed: ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
      });

    request.on('error', err => {
        fs.unlinkSync(outputPath);
        reject(err);
      });
  });
}

async function harvest(): Promise<void> {
  const manifest: Manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const catalog = { assets: [] as any[] };

  for (const item of manifest.items) {
    if (!item.url) continue;
    const ext = path.extname(new URL(item.url).pathname) || '.wav';
    const filename = `${item.id}${ext}`;
    const filePath = path.join(ASSETS_DIR, filename);

    if (!fs.existsSync(filePath)) {
      try {
        await downloadFile(item.url, filePath);
      } catch (error) {
        console.warn(`Skipping ${item.id}: ${(error as Error).message}`);
        continue;
      }
    }

    catalog.assets.push({
      id: item.id,
      type: item.type,
      genre: item.tags,
      mood: item.mood,
      recommendedVolumeDb: item.recommendedVolumeDb,
      filePath: filePath,
    });
  }

  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
}

harvest().catch(err => {
  console.error(err);
  process.exit(1);
});
