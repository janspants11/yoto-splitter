export function sanitizeTitle(title: string): string {
  return title.replace(/[^a-zA-Z0-9 \-_]/g, '').trim();
}
