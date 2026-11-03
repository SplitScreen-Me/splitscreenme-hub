import { SelectField, TextField } from '@/components/interactive/ActionForm';
import { NEWS_MESSAGE_MAX, NEWS_URL_MAX, toUtcInputValue, type NewsSeverityName } from '@/lib/news';
import { LiveTickerPreview } from './NewsTicker';

export interface NewsDefaults {
  message: string;
  url: string | null;
  severity: NewsSeverityName;
  startsAt: Date | null;
  endsAt: Date | null;
}

/** The announcement fields of the create and edit forms, with the live preview of the app's ticker. */
export function NewsFields({ defaults, now }: { defaults?: NewsDefaults; now: Date }) {
  return (
    <>
      <TextField
        name="message"
        label="Message"
        rows={3}
        required
        maxLength={NEWS_MESSAGE_MAX}
        defaultValue={defaults?.message}
        placeholder="A Windows 11 update breaks XInput controllers: here is the fix."
        hint={`Plain text on one line (line breaks become spaces), ${NEWS_MESSAGE_MAX} characters at most.`}
      />
      <TextField
        name="url"
        label="Learn more link"
        type="url"
        maxLength={NEWS_URL_MAX}
        defaultValue={defaults?.url ?? ''}
        placeholder="https://"
        hint='Optional, http or https. The app shows "Learn more" next to the message.'
      />
      <div className="grid items-start gap-4 sm:grid-cols-3">
        <SelectField
          name="severity"
          label="Severity"
          defaultValue={defaults?.severity ?? 'info'}
          options={[
            { value: 'info', label: 'Info' },
            { value: 'warning', label: 'Warning' },
            { value: 'critical', label: 'Critical' },
          ]}
          hint="Critical, then warning, come first."
        />
        <TextField
          name="startsAt"
          label="Starts (UTC)"
          type="datetime-local"
          defaultValue={defaults?.startsAt ? toUtcInputValue(defaults.startsAt) : ''}
          hint={`Empty: now. It is ${toUtcInputValue(now).replace('T', ' ')} UTC.`}
        />
        <TextField
          name="endsAt"
          label="Ends (UTC)"
          type="datetime-local"
          defaultValue={defaults?.endsAt ? toUtcInputValue(defaults.endsAt) : ''}
          hint="Optional. Empty: no end."
        />
      </div>
      <LiveTickerPreview
        message={defaults?.message}
        url={defaults?.url ?? ''}
        severity={defaults?.severity}
      />
    </>
  );
}
