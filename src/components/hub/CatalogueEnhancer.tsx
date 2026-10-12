'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useTransition } from 'react';
import { catalogueHref, parseCatalogueQuery, type CatalogueQuery } from './catalogue-query';

type Field = HTMLInputElement | HTMLSelectElement;

/** Puts the URL state back into the fields (links such as "remove filter" change it without the form). */
function syncFields(form: HTMLFormElement, query: CatalogueQuery) {
  for (const el of Array.from(form.elements) as Field[]) {
    if (el === document.activeElement || !('name' in el)) continue;
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      if (el.name === 'players') el.checked = el.value === (query.players ?? '');
      else if (el.name === 'input') el.checked = query.inputs.includes(el.value as never);
      else if (el.name === 'verified') el.checked = query.verified;
    } else if (el.name === 'q') {
      el.value = query.q;
    } else if (el.name === 'sort') {
      el.value = query.sort;
    }
  }
}

/**
 * Progressive enhancement of the catalogue form: without JavaScript it is a plain GET form with an
 * "apply" button. With it, filters apply as soon as they change, the search applies while typing
 * (debounced, replacing the history entry), URLs stay clean (no empty or default parameters) and "/"
 * focuses the search field.
 */
export function CatalogueEnhancer({
  formId,
  resultsId,
  base,
}: {
  formId: string;
  resultsId: string;
  base: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;
    form.dataset.enhanced = '';

    const go = (replace: boolean) => {
      clearTimeout(timer.current);
      const params = new URLSearchParams();
      for (const [k, v] of new FormData(form)) if (typeof v === 'string' && v) params.append(k, v);
      const url = catalogueHref(base, parseCatalogueQuery(params));
      startTransition(() => {
        if (replace) router.replace(url, { scroll: false });
        else router.push(url, { scroll: false });
      });
    };
    const owned = (t: EventTarget | null): t is Field =>
      (t instanceof HTMLInputElement || t instanceof HTMLSelectElement) && t.form === form;

    const onSubmit = (e: SubmitEvent) => {
      e.preventDefault();
      go(false);
    };
    const onChange = (e: Event) => {
      if (owned(e.target) && e.target.name !== 'q') go(false);
    };
    const onInput = (e: Event) => {
      if (!owned(e.target) || e.target.name !== 'q') return;
      const value = e.target.value.trim();
      clearTimeout(timer.current);
      if (value.length === 1) return; // wait for a second character
      timer.current = setTimeout(() => go(true), 400);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const q = Array.from(form.elements).find((el) => (el as Field).name === 'q') as Field | undefined;
      if (q) {
        e.preventDefault();
        q.focus();
      }
    };

    form.addEventListener('submit', onSubmit);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer.current);
      delete form.dataset.enhanced;
      form.removeEventListener('submit', onSubmit);
      document.removeEventListener('change', onChange);
      document.removeEventListener('input', onInput);
      document.removeEventListener('keydown', onKey);
    };
  }, [formId, base, router]);

  // Keep the fields in step with the URL (back/forward, token links, pagination).
  useEffect(() => {
    const form = document.getElementById(formId);
    if (form instanceof HTMLFormElement) syncFields(form, parseCatalogueQuery(searchParams));
  }, [formId, pathname, searchParams]);

  useEffect(() => {
    const results = document.getElementById(resultsId);
    if (!results) return;
    if (pending) results.setAttribute('aria-busy', 'true');
    else results.removeAttribute('aria-busy');
  }, [pending, resultsId]);

  return null;
}
