import Markdown from 'react-markdown';
import { cn } from '@/lib/cn';
import { linkifyText, userMarkdownOptions } from '@/lib/markdown';

/** User markdown (handler descriptions), safe by construction: see src/lib/markdown.tsx. */
export function SafeMarkdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn('prose prose-invert prose-bezel max-w-none', className)}>
      <Markdown {...userMarkdownOptions}>{source}</Markdown>
    </div>
  );
}

/** Plain-text user content (comments): line breaks kept, http(s) URLs linked (nofollow ugc). */
export function PlainText({ text, className }: { text: string; className?: string }) {
  return (
    <p className={cn('whitespace-pre-line break-words', className)}>
      {linkifyText(text).map((part, i) =>
        typeof part === 'string' ? (
          part
        ) : (
          <a
            key={i}
            href={part.href}
            rel="nofollow ugc noopener noreferrer"
            target="_blank"
            className="underline"
          >
            {part.href}
          </a>
        ),
      )}
    </p>
  );
}
