export function tableLink(code: string): string {
  return `${location.origin}/${code}`;
}

/** Opens the phone's share sheet, or copies the link. Returns a note to show. */
export async function shareTable(code: string): Promise<string> {
  const url = tableLink(code);
  const text = `Join my Take 2 table. Code: ${code}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Take 2', text, url });
      return '';
    }
    await navigator.clipboard.writeText(url);
    return 'Link copied. Paste it to your friends.';
  } catch {
    return `Share this link: ${url}`;
  }
}
