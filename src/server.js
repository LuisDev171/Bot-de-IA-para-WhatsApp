import http from 'node:http';
import crypto from 'node:crypto';
import { mascarar } from './log.js';

const LIMITE_CORPO = 1024 * 1024;

export function verificarAssinatura(raw, header, segredo) {
  if (!header || !header.startsWith('sha256=')) return false;
  const esperado = Buffer.from(crypto.createHmac('sha256', segredo).update(raw).digest('hex'));
  const recebido = Buffer.from(header.slice(7));
  return esperado.length === recebido.length && crypto.timingSafeEqual(esperado, recebido);
}

export function extrairMensagens(payload) {
  const saida = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (!v?.messages) continue;
      const nomes = new Map((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));
      for (const m of v.messages) {
        let texto = '';
        if (m.type === 'text') texto = m.text?.body ?? '';
        else if (m.type === 'interactive') texto = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '';
        else if (m.type === 'button') texto = m.button?.text ?? '';
        saida.push({ id: m.id, from: m.from, name: nomes.get(m.from), type: texto ? 'text' : m.type, text: texto });
      }
    }
  }
  return saida;
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let tamanho = 0;
    req.on('data', (c) => {
      tamanho += c.length;
      if (tamanho > LIMITE_CORPO) {
        reject(Object.assign(new Error('corpo grande demais'), { status: 413 }));
        req.destroy();
        return;
      }
      partes.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(partes)));
    req.on('error', reject);
  });
}

export function criarServidor({ config, bot, log }) {
  return http.createServer(async (req, res) => {
    const responder = (status, corpo = '', tipo = 'text/plain; charset=utf-8') => {
      res.writeHead(status, { 'content-type': tipo });
      res.end(corpo);
    };
    try {
      const url = new URL(req.url, 'http://localhost');

      if (req.method === 'GET' && url.pathname === '/health') {
        return responder(200, JSON.stringify({ ok: true }), 'application/json');
      }

      if (url.pathname !== '/webhook') return responder(404, 'Não encontrado');

      // Verificação inicial feita pela Meta ao cadastrar o webhook
      if (req.method === 'GET') {
        const ok =
          url.searchParams.get('hub.mode') === 'subscribe' &&
          url.searchParams.get('hub.verify_token') === config.verifyToken;
        return ok ? responder(200, url.searchParams.get('hub.challenge') ?? '') : responder(403, 'Token inválido');
      }

      if (req.method === 'POST') {
        const raw = await lerCorpo(req);
        if (!verificarAssinatura(raw, req.headers['x-hub-signature-256'], config.appSecret)) {
          log('warn', 'assinatura inválida no webhook');
          return responder(401, 'Assinatura inválida');
        }
        let payload;
        try {
          payload = JSON.parse(raw.toString('utf8'));
        } catch {
          return responder(400, 'JSON inválido');
        }
        // Responde 200 já: a Meta reenvia se demorarmos. O processamento segue em segundo plano.
        responder(200, 'EVENT_RECEIVED');
        for (const msg of extrairMensagens(payload)) {
          log('info', 'mensagem recebida', { tel: mascarar(msg.from), tipo: msg.type });
          bot.receber(msg);
        }
        return;
      }

      return responder(405, 'Método não permitido');
    } catch (e) {
      log('error', 'erro no servidor', { erro: e.message });
      if (!res.headersSent) responder(e.status ?? 500, 'Erro interno');
    }
  });
}
