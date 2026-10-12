import { Icon, type IconName } from '@/components/ui';
import { buttonClass } from '@/components/ui/Button';
import { enabledProviders, type ProviderName } from '@/lib/auth/oauth';

const ICONS: Partial<Record<ProviderName, IconName>> = { discord: 'discord', github: 'github' };

export const oauthStartUrl = (provider: ProviderName, next: string, intent: 'login' | 'link' = 'login') =>
  `/api/auth/oauth/${provider}?${new URLSearchParams({ next, ...(intent === 'link' && { intent }) }).toString()}`;

/**
 * "Continue with ..." for the providers configured on this server only (section 4.4), followed by an
 * "or" divider. Renders nothing when no provider is configured.
 */
export function OAuthButtons({ next }: { next: string }) {
  const providers = enabledProviders();
  if (providers.length === 0) return null;
  return (
    <>
      <div className="grid gap-2">
        {providers.map((p) => (
          // A plain link: the route answers with a redirect to the provider.
          <a
            key={p.name}
            href={oauthStartUrl(p.name, next)}
            className={buttonClass({}, 'w-full justify-center')}
          >
            {ICONS[p.name] ? (
              <Icon name={ICONS[p.name]!} />
            ) : (
              <span aria-hidden="true" className="font-bold">
                G
              </span>
            )}
            Continue with {p.label}
          </a>
        ))}
      </div>
      <div className="flex items-center gap-3" role="separator">
        <span className="h-px flex-1 bg-line" />
        <span className="micro faint uppercase">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>
    </>
  );
}
