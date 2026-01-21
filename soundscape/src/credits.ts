export interface CreditItem {
  title: string;
  author: string;
  sourceUrl: string;
  license: string;
}

export function formatCredits(items: CreditItem[]): string {
  const lines = ['Soundscape Credits', ''];
  for (const item of items) {
    lines.push(`- ${item.title} — ${item.author} (${item.license}) ${item.sourceUrl}`);
  }
  return lines.join('\n') + '\n';
}
