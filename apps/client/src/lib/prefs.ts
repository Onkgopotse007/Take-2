const NAME_KEY = 'take2:name';

/** Matches the server's join codes: no 0, O, 1, I or L. */
export const CODE_PATTERN = /^[A-HJKMNP-Z2-9]{5}$/;

export function normaliseCode(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.trim());
  } catch {
    // Private browsing: the name just is not remembered.
  }
}
