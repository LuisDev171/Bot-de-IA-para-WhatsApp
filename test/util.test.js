import test from 'node:test';
import assert from 'node:assert/strict';
import { dividirTexto, normalizarHistorico } from '../src/util.js';

test('dividirTexto mantém texto curto inteiro', () => {
  assert.deepEqual(dividirTexto('oi'), ['oi']);
});

test('dividirTexto quebra texto longo sem perder conteúdo e respeitando o limite', () => {
  const texto = Array.from({ length: 400 }, (_, i) => `Parágrafo número ${i} com algum texto.`).join('\n\n');
  const partes = dividirTexto(texto, 1000);
  assert.ok(partes.length > 1);
  assert.ok(partes.every((p) => p.length <= 1000));
  assert.equal(partes.join('\n\n').replace(/\s+/g, ' '), texto.replace(/\s+/g, ' '));
});

test('normalizarHistorico remove assistant inicial e junta papéis repetidos', () => {
  const r = normalizarHistorico([
    { role: 'assistant', content: 'x' },
    { role: 'user', content: 'a' },
    { role: 'user', content: 'b' },
    { role: 'assistant', content: 'c' },
  ]);
  assert.deepEqual(r, [
    { role: 'user', content: 'a\nb' },
    { role: 'assistant', content: 'c' },
  ]);
});
