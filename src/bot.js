import { MARCADOR_HUMANO, montarPrompt } from './prompt.js';
import { normalizarHistorico } from './util.js';
import { mascarar } from './log.js';

const MSG_NAO_TEXTO =
  'Por aqui eu consigo ler só mensagens de texto, tá? Pode me escrever o que você precisa que eu te ajudo 😊';
const MAX_CHARS_ENTRADA = 2000;

export function criarBot({ config, negocio, store, whatsapp, ia, log, notificar = async () => {} }) {
  const filas = new Map(); // tel -> Promise (processa uma mensagem por vez por cliente)
  const vistos = new Map(); // id da mensagem -> timestamp (evita processar reenvios da Meta)
  const janelas = new Map(); // tel -> [timestamps] (anti-spam)

  function jaVisto(id) {
    const agora = Date.now();
    for (const [k, t] of vistos) if (agora - t > 3600e3) vistos.delete(k);
    if (vistos.has(id)) return true;
    vistos.set(id, agora);
    return false;
  }

  function estourouLimite(tel) {
    const agora = Date.now();
    const lista = (janelas.get(tel) ?? []).filter((t) => agora - t < 60_000);
    lista.push(agora);
    janelas.set(tel, lista);
    return lista.length > config.limitePorMinuto;
  }

  async function comandoDono(msg) {
    const [cmd, alvoBruto] = msg.text.trim().split(/\s+/);
    const alvo = (alvoBruto ?? '').replace(/\D/g, '');
    if (cmd === '/retomar' && alvo) {
      const ok = store.retomar(alvo);
      return whatsapp.enviarTexto(msg.from, ok ? `Bot reativado para ${alvo}.` : `${alvo} não estava pausado.`);
    }
    if (cmd === '/pausar' && alvo) {
      store.pausar(alvo, config.handoffMs);
      return whatsapp.enviarTexto(msg.from, `Bot pausado para ${alvo}.`);
    }
    if (cmd === '/status') {
      const lista = [...store.pausados.keys()];
      return whatsapp.enviarTexto(
        msg.from,
        `Conversas ativas: ${store.conversas.size}\nPausados: ${lista.length ? lista.join(', ') : 'nenhum'}`,
      );
    }
    return whatsapp.enviarTexto(msg.from, 'Comandos: /retomar <número>, /pausar <número>, /status');
  }

  async function passarParaHumano(msg, motivo) {
    store.pausar(msg.from, config.handoffMs);
    const ultima = msg.text.slice(0, 200);
    const aviso = `Atendimento humano necessário (${motivo})\nCliente: ${msg.name ?? 'sem nome'} (${msg.from})\nÚltima mensagem: "${ultima}"\nPara reativar o bot: /retomar ${msg.from}`;
    await notificar(aviso);
  }

  async function tratar(msg) {
    const tel = msg.from;

    if (config.ownerPhone && tel === config.ownerPhone && msg.text.startsWith('/')) {
      return comandoDono(msg);
    }

    if (estourouLimite(tel)) {
      log('warn', 'limite de mensagens excedido', { tel: mascarar(tel) });
      return;
    }

    whatsapp.marcarComoLida(msg.id).catch(() => {});

    if (msg.type !== 'text') {
      if (!store.estaPausado(tel)) await whatsapp.enviarTexto(tel, MSG_NAO_TEXTO);
      return;
    }

    const texto = msg.text.trim().slice(0, MAX_CHARS_ENTRADA);
    if (!texto) return;

    store.adicionar(tel, 'user', texto);

    if (store.estaPausado(tel)) {
      log('info', 'cliente em atendimento humano, bot em silêncio', { tel: mascarar(tel) });
      return;
    }

    let resposta;
    try {
      const system = montarPrompt(negocio, { timezone: config.timezone });
      resposta = await ia({ system, mensagens: normalizarHistorico(store.historico(tel)) });
    } catch (e) {
      log('error', 'falha ao gerar resposta', { tel: mascarar(tel), erro: e.message });
      const fallback =
        negocio.mensagem_fora_do_ar ?? 'Tive um problema técnico, mas já avisei a equipe. Em breve te respondem!';
      await whatsapp.enviarTexto(tel, fallback);
      await passarParaHumano({ ...msg, text: texto }, 'falha técnica na IA');
      return;
    }

    const querHumano = resposta.includes(MARCADOR_HUMANO);
    const visivel = resposta.replaceAll(MARCADOR_HUMANO, '').trim();

    if (visivel) {
      store.adicionar(tel, 'assistant', visivel);
      await whatsapp.enviarTexto(tel, visivel);
    }
    if (querHumano) await passarParaHumano({ ...msg, text: texto }, 'pedido do cliente ou assunto fora do escopo');
  }

  return {
    receber(msg) {
      if (!msg?.from || !msg.id || jaVisto(msg.id)) return Promise.resolve();
      const anterior = filas.get(msg.from) ?? Promise.resolve();
      const atual = anterior
        .then(() => tratar(msg))
        .catch((e) => log('error', 'erro ao tratar mensagem', { tel: mascarar(msg.from), erro: e.message }))
        .finally(() => {
          if (filas.get(msg.from) === atual) filas.delete(msg.from);
        });
      filas.set(msg.from, atual);
      return atual;
    },
  };
}
