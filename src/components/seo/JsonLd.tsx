import { serializeJsonLd } from '@/lib/seo/jsonld';

/**
 * JSON-LD structured data. The only allowed `dangerouslySetInnerHTML` in the codebase
 * (scripts/check-security.mjs enforces it): `<` is escaped so the payload cannot close the script tag.
 * Data blocks are not executed, so the CSP nonce is not needed.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const json = serializeJsonLd(data);
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
