import { env } from '@/lib/env';
import { Icon } from '@/components/ui';

/** Shown when BETA=1 (read at runtime). */
export function BetaBanner() {
  if (!env().BETA) return null;
  return (
    <div className="beta-banner" role="note">
      <Icon name="info" className="h-4 w-4" />
      <span>Beta: this is a preview of the new SplitScreen.Me. Data may be reset before launch.</span>
    </div>
  );
}
