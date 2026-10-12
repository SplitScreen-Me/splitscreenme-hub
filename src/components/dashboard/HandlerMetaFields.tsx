'use client';

import { useState } from 'react';
import { SafeMarkdown } from '@/components/ui/SafeMarkdown';
import { cn } from '@/lib/cn';
import { SelectField, TextField, useActionForm } from '@/components/interactive/ActionForm';

const TRI = [
  { value: 'unknown', label: 'Not specified' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

const tri = (v: boolean | null | undefined) => (v === true ? 'yes' : v === false ? 'no' : 'unknown');

export interface MetaDefaults {
  title?: string;
  description?: string;
  maxPlayers?: number;
  controllers?: boolean | null;
  keyboardMouse?: boolean | null;
  multiKeyboardMouse?: boolean | null;
}

/** Title, description (markdown, with a preview), players and inputs: shared by create and edit. */
export function HandlerMetaFields({ defaults = {} }: { defaults?: MetaDefaults }) {
  return (
    <>
      <TextField
        name="title"
        label="Title"
        defaultValue={defaults.title}
        required
        minLength={3}
        maxLength={100}
        hint="Usually the game name, plus what makes this handler different (e.g. “Steam, 4 players”)."
      />
      <DescriptionField defaultValue={defaults.description ?? ''} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TextField
          name="maxPlayers"
          label="Max players"
          type="number"
          min={1}
          max={64}
          required
          defaultValue={defaults.maxPlayers ?? 2}
          inputMode="numeric"
        />
        <SelectField
          name="controllers"
          label="Controllers"
          options={TRI}
          defaultValue={tri(defaults.controllers)}
        />
        <SelectField
          name="keyboardMouse"
          label="One keyboard and mouse"
          options={TRI}
          defaultValue={tri(defaults.keyboardMouse)}
        />
        <SelectField
          name="multiKeyboardMouse"
          label="Several keyboards and mice"
          options={TRI}
          defaultValue={tri(defaults.multiKeyboardMouse)}
        />
      </div>
    </>
  );
}

function DescriptionField({ defaultValue }: { defaultValue: string }) {
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [value, setValue] = useState(defaultValue);
  const { state } = useActionForm();
  const errors = state.fields?.description;
  return (
    <div className="form-field">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="description" className="form-label">
          Description
        </label>
        <div role="tablist" aria-label="Description editor" className="inline-flex gap-1">
          {(['write', 'preview'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={cn('btn btn-sm', tab === t ? 'btn-primary' : 'btn-ghost')}
              onClick={() => setTab(t)}
            >
              {t === 'write' ? 'Write' : 'Preview'}
            </button>
          ))}
        </div>
      </div>
      {/* The textarea stays mounted (hidden in preview) so the form always posts it. */}
      <textarea
        id="description"
        name="description"
        className={cn('control font-mono text-sm', tab === 'preview' && 'hidden')}
        rows={12}
        maxLength={10_000}
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        aria-invalid={errors ? true : undefined}
        aria-describedby="description-hint"
      />
      {tab === 'preview' && (
        <div className="min-h-[200px] rounded-ctl bg-pane-2 p-4">
          {value.trim() ? (
            <SafeMarkdown source={value} />
          ) : (
            <p className="small faint">Nothing to preview.</p>
          )}
        </div>
      )}
      <p className="form-hint" id="description-hint">
        Markdown: setup steps, known issues, requirements. Raw HTML and images are not rendered.{' '}
        {value.length.toLocaleString('en')} / 10,000
      </p>
      {errors && <p className="form-error">{errors.join(' ')}</p>}
    </div>
  );
}
