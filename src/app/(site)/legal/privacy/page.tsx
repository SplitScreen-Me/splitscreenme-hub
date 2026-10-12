import { LegalPage, type LegalMeta } from '@/components/docs/LegalPage';
import * as mdx from '@/content/legal/privacy.mdx';
import { buildMetadata } from '@/lib/seo/metadata';
import { paths } from '@/lib/urls';

const meta = (mdx as unknown as { meta: LegalMeta }).meta;

export const generateMetadata = () =>
  buildMetadata({ title: meta.title, description: meta.description, path: paths.legal('privacy') });

export default function Page() {
  return <LegalPage slug="privacy" meta={meta} Content={mdx.default} />;
}
