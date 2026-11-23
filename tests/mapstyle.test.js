// Rótulos do mapa (js/mapstyle.js): português primeiro, depois o nome local, por último o inglês.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ptLabel } from '../js/mapstyle.js';

const LIBERTY = ['case', ['has', 'name:nonlatin'],
  ['concat', ['get', 'name:latin'], '\n', ['get', 'name:nonlatin']],
  ['coalesce', ['get', 'name_en'], ['get', 'name']]];

test('ptLabel: name:pt primeiro e o nome local antes do inglês', () => {
  const out = ptLabel(LIBERTY);
  assert.deepEqual(out[0], 'coalesce');
  assert.deepEqual(out[1], ['get', 'name:pt']);
  const json = JSON.stringify(out);
  assert.ok(json.indexOf('["get","name"]') < json.indexOf('["get","name_en"]'), json);
  assert.ok(json.includes('name:nonlatin'), 'escrita não latina continua igual');
});

test('ptLabel: "{name}" vira expressão com name:pt', () => {
  assert.deepEqual(ptLabel('{name}')[1], ['get', 'name:pt']);
});

test('ptLabel: não mexe no que não é nome (escudo de rodovia, número da casa)', () => {
  assert.equal(ptLabel('{ref}'), '{ref}');
  const house = ['to-string', ['get', 'housenumber']];
  assert.equal(ptLabel(house), house);
  assert.equal(ptLabel(undefined), undefined);
});

test('ptLabel: aplicar duas vezes não muda nada', () => {
  const once = ptLabel(LIBERTY);
  assert.equal(ptLabel(once), once);
});
