import test from 'node:test';
import assert from 'node:assert/strict';
import { criarIA } from '../src/ai.js';
import { criarWhatsApp } from '../src/whatsapp.js';

const resp = (status, corpo) => ({ ok: status < 300, status, json: async () => corpo, text: async () => JSON.stringify(corpo) });

test('IA: monta requisição correta e extrai o texto', async () => {
  let chamada;
  const ia = criarIA({
    config: { anthropicKey: 'k', model: 'm' },
    fetchImpl: async (url, opts) => {
      chamada = { url, opts };
      return resp(200, { content: [{ type: 'text', text: ' Olá! ' }] });
    },
  });
  const r = await ia({ system: 'sys', mensagens: [{ role: 'user', content: 'oi' }] });
  assert.equal(r, 'Olá!');
  assert.equal(chamada.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(chamada.opts.headers['x-api-key'], 'k');
  assert.equal(JSON.parse(chamada.opts.body).model, 'm');
});

test('IA: tenta de novo em erro 500 e não repete em erro 400', async () => {
  let n = 0;
  const ia500 = criarIA({
    config: { anthropicKey: 'k', model: 'm' },
    fetchImpl: async () => (++n < 2 ? resp(500, {}) : resp(200, { content: [{ type: 'text', text: 'ok' }] })),
  });
  assert.equal(await ia500({ system: 's', mensagens: [] }), 'ok');
  assert.equal(n, 2);

  let m = 0;
  const ia400 = criarIA({ config: { anthropicKey: 'k', model: 'm' }, fetchImpl: async () => (m++, resp(400, { erro: 'x' })) });
  await assert.rejects(ia400({ system: 's', mensagens: [] }));
  assert.equal(m, 1);
});

test('WhatsApp: envia texto no formato da Cloud API', async () => {
  const chamadas = [];
  const wa = criarWhatsApp({
    config: { phoneId: '123', whatsappToken: 'tok' },
    fetchImpl: async (url, opts) => (chamadas.push({ url, opts }), resp(200, {})),
  });
  await wa.enviarTexto('5512999990000', 'Olá');
  const corpo = JSON.parse(chamadas[0].opts.body);
  assert.match(chamadas[0].url, /\/123\/messages$/);
  assert.equal(chamadas[0].opts.headers.authorization, 'Bearer tok');
  assert.equal(corpo.messaging_product, 'whatsapp');
  assert.equal(corpo.to, '5512999990000');
  assert.equal(corpo.text.body, 'Olá');
});
