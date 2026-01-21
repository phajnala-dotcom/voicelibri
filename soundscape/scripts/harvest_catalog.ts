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

function getFreesoundApiKey(): string | undefined {
  return process.env.FREESOUND_API_KEY;
}

function extractFreesoundId(url: string): string | null {
  const match = url.match(/freesound\.org\/people\/.+?\/sounds\/(\d+)\//i);
  return match?.[1] ?? null;
}

function fetchJson(url: string, headers: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers }, response => {
      const statusCode = response.statusCode || 0;
      let body = '';

      response.on('data', chunk => {
        body += chunk.toString('utf8');
      });

      response.on('end', () => {
        if (statusCode >= 400) {
          reject(new Error(`Request failed: ${statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on('error', reject);
  });
}

async function getFreesoundPreviewUrl(sourceUrl: string): Promise<string | null> {
  const soundId = extractFreesoundId(sourceUrl);
  const apiKey = getFreesoundApiKey();
  if (!soundId || !apiKey) return null;

  const apiUrl = `https://freesound.org/apiv2/sounds/${soundId}/?fields=previews`;
  const response = await fetchJson(apiUrl, { Authorization: `Token ${apiKey}` });
  const previews = response?.previews;

  return previews?.['preview-hq-mp3']
    || previews?.['preview-hq-ogg']
    || previews?.['preview-lq-mp3']
    || previews?.['preview-lq-ogg']
    || null;
}

function isProbablyHtmlFile(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(64);
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);
    if (bytesRead === 0) return false;
    const head = buffer.toString('utf8', 0, bytesRead).trimStart().toLowerCase();
    return head.startsWith('<!doctype') || head.startsWith('<html');
  } catch {
    return false;
  }
}

function downloadFile(url: string, outputPath: string, redirectLimit: number = 5): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    const needsCookie = url.includes('freesound.org');
    const cookie = process.env.FREESOUND_COOKIE;
    const headers = needsCookie && cookie ? { Cookie: cookie } : undefined;

    const request = https.get(url, { headers }, response => {
      const statusCode = response.statusCode || 0;
      const location = response.headers.location;
      const contentType = (response.headers['content-type'] || '').toString().toLowerCase();

      if (statusCode >= 300 && statusCode < 400 && location) {
        response.resume();
        file.close(() => {
          fs.unlinkSync(outputPath);
          if (redirectLimit <= 0) {
            reject(new Error(`Too many redirects for ${url}`));
            return;
          }
          const nextUrl = new URL(location, url).toString();
          downloadFile(nextUrl, outputPath, redirectLimit - 1).then(resolve).catch(reject);
        });
        return;
      }

      if (statusCode >= 400) {
        response.resume();
        reject(new Error(`Download failed: ${statusCode}`));
        return;
      }

      if (contentType.includes('text/html')) {
        response.resume();
        reject(new Error('Download returned HTML (auth required or invalid cookie)'));
        return;
      }

      response.pipe(file);
      file.on('finish', () => file.close(() => {
        const stat = fs.statSync(outputPath);
        if (stat.size === 0) {
          fs.unlinkSync(outputPath);
          reject(new Error('Downloaded file is empty'));
          return;
        }
        resolve();
      }));
    });

    request.on('error', err => {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      reject(err);
    });
  });
}

async function harvest(): Promise<void> {
  const manifest: Manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const catalog = { assets: [] as any[] };

  for (const item of manifest.items) {
    if (!item.url) continue;
    let downloadUrl = item.url;

    if (item.url.includes('freesound.org')) {
      const previewUrl = await getFreesoundPreviewUrl(item.url);
      if (previewUrl) {
        downloadUrl = previewUrl;
      }
    }

    const ext = path.extname(new URL(downloadUrl).pathname) || '.wav';
    const filename = `${item.id}${ext}`;
    const filePath = path.join(ASSETS_DIR, filename);

    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      if (stat.size === 0 || isProbablyHtmlFile(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    if (!fs.existsSync(filePath)) {
      try {
        await downloadFile(downloadUrl, filePath);
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
