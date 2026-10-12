import { LegalPage, type LegalMeta } from '@/components/docs/LegalPage';
import * as mdx from '@/content/legal/notice.mdx';
import { buildMetadata } from '@/lib/seo/metadata';
import { paths } from '@/lib/urls';

const meta = (mdx as unknown as { meta: LegalMeta }).meta;

export const generateMetadata = () =>
  buildMetadata({ title: meta.title, description: meta.description, path: paths.legal('notice') });

export default function Page() {
  return <LegalPage slug="notice" meta={meta} Content={mdx.default} />;
}
