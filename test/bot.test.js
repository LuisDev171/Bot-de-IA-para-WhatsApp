import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { criarBot } from '../src/bot.js';
import { Store } from '../src/store.js';

const negocio = JSON.parse(fs.readFileSync('config/negocio.json', 'utf8'));
const base = { ownerPhone: '5512000000000', handoffMs: 3600e3, limitePorMinuto: 5, timezone: 'America/Sao_Paulo' };

function montar({ resposta = 'Oi! Como posso ajudar?', falha = false, config = {} } = {}) {
  const enviados = [];
  const avisos = [];
  const chamadasIA = [];
  const whatsapp = {
    enviarTexto: async (para, texto) => enviados.push({ para, texto }),
    marcarComoLida: async () => {},
  };
  const ia = async (args) => {
    chamadasIA.push(args);
    if (falha) throw new Error('IA fora do ar');
    return typeof resposta === 'function' ? resposta(args) : resposta;
  };
  const store = new Store();
  const bot = criarBot({
    config: { ...base, ...config },
    negocio,
    store,
    whatsapp,
    ia,
    log: () => {},
    notificar: async (t) => avisos.push(t),
  });
  return { bot, enviados, avisos, chamadasIA, store };
}
const msg = (over = {}) => ({ id: `id-${Math.random()}`, from: '5512999990000', name: 'Ana', type: 'text', text: 'Oi', ...over });

test('responde mensagem de texto e guarda histórico', async () => {
  const { bot, enviados, store } = montar();
  await bot.receber(msg());
  assert.deepEqual(enviados, [{ para: '5512999990000', texto: 'Oi! Como posso ajudar?' }]);
  assert.equal(store.historico('5512999990000').length, 2);
});

test('envia histórico anterior para a IA', async () => {
  const { bot, chamadasIA } = montar();
  await bot.receber(msg({ text: 'Quanto custa a massagem?' }));
  await bot.receber(msg({ text: 'E a limpeza de pele?' }));
  const ultimo = chamadasIA.at(-1).mensagens;
  assert.deepEqual(ultimo.map((m) => m.role), ['user', 'assistant', 'user']);
});

test('ignora mensagem duplicada (reenvio da Meta)', async () => {
  const { bot, enviados } = montar();
  const m = msg();
  await bot.receber(m);
  await bot.receber(m);
  assert.equal(enviados.length, 1);
});

test('marcador [HUMANO] some para o cliente, pausa o bot e avisa a equipe', async () => {
  const { bot, enviados, avisos, store } = montar({ resposta: 'Vou chamar a equipe! [HUMANO]' });
  await bot.receber(msg({ text: 'Quero falar com uma pessoa' }));
  assert.equal(enviados[0].texto, 'Vou chamar a equipe!');
  assert.ok(!enviados[0].texto.includes('HUMANO'));
  assert.ok(store.estaPausado('5512999990000'));
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /\/retomar 5512999990000/);
});

test('bot fica em silêncio enquanto cliente está pausado e volta após /retomar do dono', async () => {
  const { bot, enviados, chamadasIA, store } = montar();
  store.pausar('5512999990000', 3600e3);
  await bot.receber(msg({ text: 'alguém aí?' }));
  assert.equal(chamadasIA.length, 0);
  assert.equal(enviados.length, 0);
  await bot.receber(msg({ from: '5512000000000', text: '/retomar 5512999990000' }));
  assert.match(enviados.at(-1).texto, /reativado/);
  await bot.receber(msg({ text: 'voltei' }));
  assert.equal(chamadasIA.length, 1);
});

test('comandos do dono não funcionam para outros números', async () => {
  const { bot, store } = montar();
  store.pausar('5512888880000', 3600e3);
  await bot.receber(msg({ from: '5512777770000', text: '/retomar 5512888880000' }));
  assert.ok(store.estaPausado('5512888880000'));
});

test('falha da IA: manda mensagem de contingência, pausa e avisa a equipe', async () => {
  const { bot, enviados, avisos } = montar({ falha: true });
  await bot.receber(msg());
  assert.equal(enviados[0].texto, negocio.mensagem_fora_do_ar);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /falha técnica/);
});

test('mensagem que não é texto recebe pedido educado, sem chamar a IA', async () => {
  const { bot, enviados, chamadasIA } = montar();
  await bot.receber(msg({ type: 'audio', text: '' }));
  assert.equal(chamadasIA.length, 0);
  assert.match(enviados[0].texto, /só mensagens de texto/);
});

test('limite por minuto ignora excesso de mensagens', async () => {
  const { bot, chamadasIA } = montar();
  for (let i = 0; i < 8; i++) await bot.receber(msg({ text: `m${i}` }));
  assert.equal(chamadasIA.length, 5);
});

test('mensagens do mesmo cliente são processadas em ordem', async () => {
  const ordem = [];
  const { bot } = montar({
    resposta: async ({ mensagens }) => {
      const ultima = mensagens.at(-1).content;
      await new Promise((r) => setTimeout(r, ultima === 'primeira' ? 40 : 1));
      ordem.push(ultima);
      return 'ok';
    },
  });
  await Promise.all([bot.receber(msg({ text: 'primeira' })), bot.receber(msg({ text: 'segunda' }))]);
  assert.deepEqual(ordem.map((o) => o.split('\n')[0]).slice(0, 1), ['primeira']);
});
