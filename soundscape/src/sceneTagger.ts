import { DEFAULT_KEYWORD_MAP } from './keywordMap';

export interface SceneTags {
  tags: string[];
  moods: string[];
}

export function extractSceneTags(text: string, keywordMap = DEFAULT_KEYWORD_MAP): SceneTags {
  const lower = text.toLowerCase();
  const tags: string[] = [];

  for (const [tag, keywords] of Object.entries(keywordMap)) {
    if (keywords.some(k => lower.includes(k))) {
      tags.push(tag);
    }
  }

  return { tags, moods: [] };
}
