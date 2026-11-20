// Preferências e abreviação de nomes de ruas (js/settings.js).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from './helpers.js';

globalThis.localStorage = memoryStorage();
const { abbreviate, signName, getSetting, setSetting } = await import('../js/settings.js');
const { bus } = await import('../js/core.js');

beforeEach(() => localStorage.clear());

test('abbreviate: tipo da via só no começo', () => {
  assert.equal(abbreviate('Rua Felipe Schmidt'), 'R. Felipe Schmidt');
  assert.equal(abbreviate('Avenida Beira-Mar Norte'), 'Av. Beira-Mar Norte');
  assert.equal(abbreviate('Servidão das Tartarugas'), 'Serv. das Tartarugas');
  assert.equal(abbreviate('Travessa da Rua Nova'), 'Tv. da Rua Nova', '"Rua" no meio não é tipo');
});

test('abbreviate: títulos em qualquer posição', () => {
  assert.equal(abbreviate('Rua Doutor Leonel Pereira'), 'R. Dr. Leonel Pereira');
  assert.equal(abbreviate('Rodovia Deputado Armando Calil Bulos'), 'Rod. Dep. Armando Calil Bulos');
  assert.equal(abbreviate('Avenida Nossa Senhora da Penha'), 'Av. N. Sra. da Penha');
  assert.equal(abbreviate('Praça Professora Maria'), 'Pç. Profa. Maria', 'feminino antes do masculino');
});

test('abbreviate: não corta palavras que só começam igual', () => {
  assert.equal(abbreviate('Rua Domingos Filomeno'), 'R. Domingos Filomeno');
  assert.equal(abbreviate('Ruano Costa'), 'Ruano Costa');
  assert.equal(abbreviate('Avenidas'), 'Avenidas');
});

test('abbreviate: maiúsculas/minúsculas e espaços', () => {
  assert.equal(abbreviate('  RUA das Flores '), 'R. das Flores');
});

test('abbreviate: vazio e nulo passam direto', () => {
  assert.equal(abbreviate(''), '');
  assert.equal(abbreviate(null), null);
  assert.equal(abbreviate(undefined), undefined);
});

test('signName: abrevia por padrão e respeita a preferência', () => {
  assert.equal(signName('Rua A'), 'R. A');
  setSetting('abbreviate', false);
  assert.equal(signName('Rua A'), 'Rua A');
});

test('getSetting: padrões', () => {
  assert.equal(getSetting('theme'), 'auto');
  assert.equal(getSetting('voice'), true);
  assert.equal(getSetting('autoCollapse'), true);
});

test('setSetting: tema "auto" apaga a escolha; voz usa a chave antiga "muted"', () => {
  setSetting('theme', 'dark');
  assert.equal(getSetting('theme'), 'dark');
  setSetting('theme', 'auto');
  assert.equal(localStorage.getItem('meumapa:theme'), 'null');
  assert.equal(getSetting('theme'), 'auto');
  setSetting('voice', false);
  assert.equal(localStorage.getItem('meumapa:muted'), 'true');
  assert.equal(getSetting('voice'), false);
});

test('setSetting avisa quem escuta "settings:changed"', () => {
  const seen = [];
  const off = bus.on('settings:changed', (e) => seen.push(e));
  setSetting('autoCollapse', false);
  off();
  assert.deepEqual(seen, [{ key: 'autoCollapse', value: false }]);
});

test('armazenamento corrompido não quebra: volta ao padrão', () => {
  localStorage.setItem('meumapa:set:abbreviate', '{não é json');
  assert.equal(getSetting('abbreviate'), true);
});
