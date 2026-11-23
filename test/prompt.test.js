import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { montarPrompt, MARCADOR_HUMANO } from '../src/prompt.js';

const negocio = JSON.parse(fs.readFileSync('config/negocio.json', 'utf8'));

test('prompt inclui dados do negócio, serviços e regra de handoff', () => {
  const p = montarPrompt(negocio, { agora: new Date('2026-11-23T15:00:00Z') });
  assert.match(p, /Studio Exemplo/);
  assert.match(p, /Limpeza de pele: R\$ 120/);
  assert.match(p, /Tem estacionamento\?/);
  assert.ok(p.includes(MARCADOR_HUMANO));
  assert.match(p, /segunda-feira, 23 de novembro de 2026/);
});
