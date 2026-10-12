import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as docsRoute from '@/app/api/v3/docs/route';
import * as openapiRoute from '@/app/api/v3/openapi.json/route';
import * as indexRoute from '@/app/api/v3/route';
import { API_TAGS } from '@/lib/api/openapi';
import { HandlersQuery, parseQuery } from '@/lib/api/schemas/params';
import { call, expectApiHeaders } from './fixtures';

const API_DIR = path.resolve('src/app/api/v3');
interface Operation {
  summary?: string;
  operationId?: string;
  tags: string[];
  responses: Record<string, unknown>;
  parameters?: { name: string; description?: string }[];
}

const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

/** Every route.ts under src/app/api/v3 as an OpenAPI path with its exported methods (catch-all excluded). */
function routeFiles(): { path: string; methods: string[] }[] {
  const out: { path: string; methods: string[] }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        if (!name.startsWith('_') && !name.startsWith('[...')) walk(full);
      } else if (name === 'route.ts') {
        const rel = path.relative(API_DIR, dir).split(path.sep).join('/');
        const source = readFileSync(full, 'utf8');
        out.push({
          path: `/${rel.replace(/\[([^\]]+)\]/g, '{$1}')}`,
          methods: METHODS.filter((m) => new RegExp(`export const ${m}\\b`).test(source)),
        });
      }
    }
  };
  walk(API_DIR);
  return out;
}

async function getDocument() {
  const res = await call(openapiRoute.GET, '/api/v3/openapi.json', {});
  expect(res.status).toBe(200);
  expectApiHeaders(res);
  return res.json();
}

describe('OpenAPI document', () => {
  it('is OpenAPI 3.1 with the server, the overview and the guide link', async () => {
    const doc = await getDocument();
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.version).toBe('3.0.0');
    expect(doc.servers).toEqual([{ url: 'http://localhost:3000/api/v3' }]);
    expect(doc.info.description).toContain('Rate limits');
    expect(doc.externalDocs.url).toBe('http://localhost:3000/doc/api');
  });

  it('documents every route and every method it exports', async () => {
    const doc = await getDocument();
    const routes = routeFiles();
    expect(routes.length).toBeGreaterThanOrEqual(15);
    for (const route of routes) {
      const item = doc.paths[route.path];
      expect(item, route.path).toBeDefined();
      for (const m of route.methods) {
        if (m === 'HEAD' && route.path !== '/handlers/{id}/download') continue; // HEAD mirrors GET
        expect(item[m.toLowerCase()], `${m} ${route.path}`).toBeDefined();
      }
    }
    // ...and nothing that does not exist.
    for (const p of Object.keys(doc.paths)) expect(routes.map((r) => r.path)).toContain(p);
  });

  it('gives every operation an id, a known tag, a summary and its error responses', async () => {
    const doc = await getDocument();
    const tags = API_TAGS.map((t) => t.name);
    const ids = new Set<string>();
    for (const [p, item] of Object.entries<Record<string, Operation>>(doc.paths)) {
      for (const [method, op] of Object.entries(item)) {
        const where = `${method} ${p}`;
        expect(op.summary, where).toBeTruthy();
        expect(op.operationId, where).toBeTruthy();
        const id = String(op.operationId);
        expect(ids.has(id), where).toBe(false);
        ids.add(id);
        for (const t of op.tags) expect(tags, where).toContain(t);
        expect(op.responses['500'] ?? op.responses['200'], where).toBeDefined();
        if (p !== '/docs' && p !== '/openapi.json' && p !== '/health') {
          expect(op.responses['429'], where).toBeDefined();
        }
        for (const param of op.parameters ?? []) {
          expect(param.description, `${where} param ${param.name}`).toBeTruthy();
        }
      }
    }
  });

  it('only references schemas it defines', async () => {
    const doc = await getDocument();
    const refs = JSON.stringify(doc).match(/"#\/components\/schemas\/[^"]+"/g) ?? [];
    expect(refs.length).toBeGreaterThan(10);
    for (const ref of new Set(refs)) {
      const name = ref.slice('"#/components/schemas/'.length, -1);
      expect(doc.components.schemas[name], name).toBeDefined();
    }
    for (const name of [
      'HandlerSummary',
      'HandlerDetail',
      'Version',
      'Comment',
      'Game',
      'Genre',
      'Author',
      'Stats',
      'ReportBody',
      'Error',
    ]) {
      expect(doc.components.schemas[name], name).toBeDefined();
    }
  });

  it('documents the download counting and count=false', async () => {
    const doc = await getDocument();
    const op = doc.paths['/handlers/{id}/download'].get;
    expect(op.description).toContain('count=false');
    expect(op.parameters.find((p: { name: string }) => p.name === 'count').schema).toMatchObject({
      type: 'boolean',
      default: true,
    });
  });
});

describe('API index', () => {
  it('links the reference, the document and the guide', async () => {
    const res = await call(indexRoute.GET, '/api/v3', {});
    expect(res.status).toBe(200);
    expectApiHeaders(res);
    expect(await res.json()).toEqual({
      name: 'SplitScreen.Me API',
      version: '3.0.0',
      docs: 'http://localhost:3000/api/v3/docs',
      openapi: 'http://localhost:3000/api/v3/openapi.json',
      guide: 'http://localhost:3000/doc/api',
    });
  });
});

describe('Swagger UI page', () => {
  it('is self-hosted under a strict CSP', async () => {
    const res = await call(docsRoute.GET, '/api/v3/docs', {});
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    const csp = res.headers.get('content-security-policy')!;
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('unsafe-eval');
    const html = await res.text();
    expect(html).toContain('/api-docs/swagger-ui-bundle.js');
    expect(html).toContain('/api-docs/init.js');
    expect(html).not.toMatch(/https?:\/\/(?!localhost)/); // no third-party asset
    const init = readFileSync(path.resolve('public/api-docs/init.js'), 'utf8');
    expect(init).toContain("url: '/api/v3/openapi.json'");
    expect(init).toContain('validatorUrl: null');
    expect(existsSync(path.resolve('scripts/copy-swagger.mjs'))).toBe(true);
  });
});

describe('query parsing', () => {
  const parse = (qs: string) => parseQuery(HandlersQuery, new URL(`http://localhost/?${qs}`));
  it('applies defaults, repeats arrays and ignores empty or unknown parameters', () => {
    expect(parse('')).toEqual({ sort: 'trending', page: 1, pageSize: 24 });
    expect(parse('q=&genre=&foo=bar&page=2')).toEqual({ sort: 'trending', page: 2, pageSize: 24 });
    expect(parse('input=controllers&input=keyboardMouse').input).toEqual(['controllers', 'keyboardMouse']);
    expect(parse('verified=1').verified).toBe(true);
    expect(parse('verified=false').verified).toBe(false);
    expect(parse('players=9%2B').players).toBe('9+');
    expect(parse('q=%20%20portal%20').q).toBe('portal');
  });
});
