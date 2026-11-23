import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { criarServidor, verificarAssinatura, extrairMensagens } from '../src/server.js';

const config = { verifyToken: 'segredo', appSecret: 'app-secret' };
const assinar = (corpo) => `sha256=${crypto.createHmac('sha256', config.appSecret).update(corpo).digest('hex')}`;

const payload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      changes: [
        {
          value: {
            contacts: [{ wa_id: '5512999990000', profile: { name: 'Ana' } }],
            messages: [{ id: 'wamid.1', from: '5512999990000', type: 'text', text: { body: 'Oi' } }],
          },
        },
      ],
    },
  ],
};

async function subir() {
  const recebidas = [];
  const bot = { receber: (m) => recebidas.push(m) };
  const servidor = criarServidor({ config, bot, log: () => {} });
  await new Promise((r) => servidor.listen(0, r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  return { base, recebidas, fechar: () => new Promise((r) => servidor.close(r)) };
}

test('verificarAssinatura aceita assinatura correta e rejeita errada', () => {
  const raw = Buffer.from('{"a":1}');
  assert.ok(verificarAssinatura(raw, assinar(raw), config.appSecret));
  assert.ok(!verificarAssinatura(raw, 'sha256=abc', config.appSecret));
  assert.ok(!verificarAssinatura(raw, undefined, config.appSecret));
});

test('extrairMensagens lê texto, nome e botões', () => {
  const [m] = extrairMensagens(payload);
  assert.deepEqual(m, { id: 'wamid.1', from: '5512999990000', name: 'Ana', type: 'text', text: 'Oi' });
  const [b] = extrairMensagens({
    entry: [{ changes: [{ value: { messages: [{ id: 'x', from: '1', type: 'interactive', interactive: { button_reply: { title: 'Sim' } } }] } }] }],
  });
  assert.equal(b.text, 'Sim');
  assert.equal(b.type, 'text');
});

test('GET /webhook: verificação da Meta', async () => {
  const s = await subir();
  try {
    const ok = await fetch(`${s.base}/webhook?hub.mode=subscribe&hub.verify_token=segredo&hub.challenge=12345`);
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), '12345');
    const ruim = await fetch(`${s.base}/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1`);
    assert.equal(ruim.status, 403);
  } finally {
    await s.fechar();
  }
});

test('POST /webhook: rejeita sem assinatura, aceita com assinatura e entrega ao bot', async () => {
  const s = await subir();
  try {
    const corpo = JSON.stringify(payload);
    const sem = await fetch(`${s.base}/webhook`, { method: 'POST', body: corpo });
    assert.equal(sem.status, 401);
    assert.equal(s.recebidas.length, 0);
    const com = await fetch(`${s.base}/webhook`, { method: 'POST', body: corpo, headers: { 'x-hub-signature-256': assinar(corpo) } });
    assert.equal(com.status, 200);
    assert.equal(s.recebidas.length, 1);
    assert.equal(s.recebidas[0].text, 'Oi');
  } finally {
    await s.fechar();
  }
});

test('GET /health e rota desconhecida', async () => {
  const s = await subir();
  try {
    assert.equal((await fetch(`${s.base}/health`)).status, 200);
    assert.equal((await fetch(`${s.base}/nada`)).status, 404);
  } finally {
    await s.fechar();
  }
});
