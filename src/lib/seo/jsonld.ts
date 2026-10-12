/**
 * Serialises JSON-LD for an inline <script type="application/ld+json">: `<` is escaped so the payload
 * cannot close the tag, and the line separators U+2028/U+2029 too. The result is the same JSON value.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(
    /[<\u2028\u2029]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}
