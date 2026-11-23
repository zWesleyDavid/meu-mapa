// Consistência do projeto: o que precisa andar junto e é fácil de esquecer
// (lista de arquivos offline do service worker, versões, arquivos referenciados, imports).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';
import { CONFIG } from '../js/config.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const sw = read('sw.js');
const listIn = (name) => {
  const m = sw.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  assert.ok(m, `${name} não encontrado no sw.js`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
};
const SHELL = listIn('SHELL');
const LIBS = listIn('LIBS');
const modules = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`);

test('sw.js guarda todos os módulos do app para funcionar offline', () => {
  const missing = modules.filter((m) => !SHELL.includes(m));
  assert.deepEqual(missing, [], `faltam no SHELL do sw.js: ${missing.join(', ')}`);
});

test('todos os arquivos da lista offline existem', () => {
  const missing = SHELL.filter((p) => p !== './' && !existsSync(join(ROOT, p)));
  assert.deepEqual(missing, []);
});

test('sw.js guarda os arquivos que o index.html carrega', () => {
  const html = read('index.html');
  const local = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
    .filter((u) => !/^(https?:|#|data:)/.test(u)).map((u) => u.replace(/^\.\//, ''));
  assert.ok(local.length > 0);
  for (const u of local) {
    assert.ok(existsSync(join(ROOT, u)), `index.html aponta para um arquivo que não existe: ${u}`);
    assert.ok(SHELL.includes(u), `index.html carrega ${u}, mas o sw.js não guarda para uso offline`);
  }
  const remote = [...html.matchAll(/(?:src|href)="(https:\/\/unpkg[^"]+)"/g)].map((m) => m[1]);
  for (const u of remote) assert.ok(LIBS.includes(u), `biblioteca externa fora do cache offline: ${u}`);
});

test('versão do service worker e a do app (menu ⋯) são a mesma', () => {
  const v = sw.match(/const VERSION = '([^']+)'/)[1];
  assert.equal(v, `v${CONFIG.version}`);
});

test('ícones do manifest existem', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'), 'precisa de um ícone maskable (Android)');
  for (const i of manifest.icons) assert.ok(existsSync(join(ROOT, i.src)), i.src);
});

test('todo import relativo aponta para um arquivo que existe', () => {
  for (const m of modules) {
    for (const [, spec] of read(m).matchAll(/^import\s[^'"]*['"](\.[^'"]+)['"]/gm)) {
      const target = normalize(join(dirname(m), spec));
      assert.ok(existsSync(join(ROOT, target)), `${m} importa ${spec}, que não existe`);
    }
  }
});

test('as consultas de layout do JS também existem no CSS', () => {
  const css = read('css/app.css');
  for (const [name, q] of Object.entries(CONFIG.layout)) {
    assert.ok(css.includes(`@media ${q}`), `CONFIG.layout.${name} não aparece como @media no css/app.css`);
  }
});

test('categorias: ids únicos e palavras de atalho sem repetição entre categorias', () => {
  const ids = CONFIG.categories.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  const words = CONFIG.categories.flatMap((c) => c.words || []);
  assert.equal(new Set(words).size, words.length);
  for (const w of words) assert.equal(w, w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(), `palavra deve estar sem acento e minúscula: ${w}`);
});

test('relevo do 3D declara o zoom máximo que o servidor tem (evita centenas de 404)', () => {
  const t = CONFIG.map3d.terrain;
  assert.ok(Array.isArray(t.tiles) && t.tiles[0].includes('{z}/{x}/{y}'), 'precisa de "tiles", não do tilejson sem maxzoom');
  assert.equal(t.encoding, 'terrarium');
  assert.ok(t.maxzoom <= 12, `maxzoom ${t.maxzoom}: no Brasil só existem blocos até o 12`);
  assert.ok(/Mapterhorn/.test(t.attribution), 'atribuição obrigatória');
});
