import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultContent } from '../core/content';
import {defaultPublicAccounts} from '../core/twitter-public';
import {hydrateCharacterDefaults} from '../core/character-defaults';
import {validateContent} from '../server/validation';
import { initializeRuntime } from '../server/runtime';
import { read, write } from '../server/repository';
import { GET, POST } from '../server/editor-api';

test('reset restores current source, preserves other records and rejects stale revisions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'editor-reset-'));
  const close = initializeRuntime({ dataDir: join(dir, 'data'), projectDir: dir, port: 9487, env: {} });
  try {
    mkdirSync(join(dir, 'content'), { recursive: true });
    const source = structuredClone(defaultContent);
    source.events[0].title = 'Source default';
    const file = join(dir, 'content/game.json');
    writeFileSync(file, JSON.stringify(source));
    const saved = structuredClone(source);
    saved.events[0].title = 'Editor override';
    await write('content', saved);
    await write('game:test', { marker: 'save' });
    await write('api-settings', { model: 'custom' });
    const current = await (await GET(new Request('http://localhost:9487/api/editor'))).json();
    const reset = (revision: number) => POST(new Request('http://localhost:9487/api/editor', {
      method: 'POST', headers: { origin: 'http://localhost:9487' },
      body: JSON.stringify({ type: 'reset-content', revision }),
    }));
    const response = await reset(current.revision);
    expect(response.status).toBe(200);
    const result = await response.json();
    const expected=validateContent(hydrateCharacterDefaults({...structuredClone(source),publicAccounts:defaultPublicAccounts()},'ja'));
    expect(result.content).toEqual(expected);
    expect(result.revision).toBeGreaterThan(current.revision);
    expect(await read<unknown>('content', null)).toEqual(expected);
    expect(await read<unknown>('game:test', null)).toEqual({ marker: 'save' });
    expect(await read<unknown>('api-settings', null)).toEqual({ model: 'custom' });
    expect(readFileSync(file, 'utf8')).toBe(JSON.stringify(source));
    expect((await reset(current.revision)).status).toBe(400);
    expect((await reset(-1)).status).toBe(400);
  } finally {
    close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('LLM settings reject missing required connection fields', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'editor-required-'));
  const close = initializeRuntime({ dataDir: join(dir, 'data'), projectDir: dir, port: 9487, env: {} });
  const original=globalThis.fetch;
  try {
    globalThis.fetch=Object.assign(async(_url:unknown,init?:RequestInit)=>{const body=JSON.parse(String(init?.body));expect(body.tools[0].function.name).toBe('report_gender');expect(body.messages[0].content.filter((part:any)=>part.type==='image_url')).toHaveLength(1);return Response.json({choices:[{message:{tool_calls:[{function:{name:'report_gender',arguments:JSON.stringify({gender:'girl'})}}]}}]});},{preconnect:original.preconnect});
    const save = (body: Record<string, unknown>) => POST(new Request('http://localhost:9487/api/editor', {
      method: 'POST', headers: { origin: 'http://localhost:9487' },
      body: JSON.stringify({ type: 'api', contextTokens: 32768, ...body }),
    }));
    for (const body of [
      { url: '', model: 'model', key: 'key' },
      { url: 'https://example.com/v1', model: '', key: 'key' },
      { url: 'https://example.com/v1', model: 'model', key: '   ' },
    ]) expect((await save(body)).status).toBe(400);
    expect((await save({ url: 'https://example.com/v1', model: ' model ', key: ' key ' })).status).toBe(200);
    expect(await read('api-settings', null)).toMatchObject({ url: 'https://example.com/v1', model: 'model', key: 'key' });
  } finally {
    globalThis.fetch=original;
    close();
    rmSync(dir, { recursive: true, force: true });
  }
});
