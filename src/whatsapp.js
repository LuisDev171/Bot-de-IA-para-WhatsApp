import { dividirTexto, dormir } from './util.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

export function criarWhatsApp({ config, fetchImpl = fetch }) {
  async function chamar(corpo) {
    let ultimoErro;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      try {
        const res = await fetchImpl(`${GRAPH}/${config.phoneId}/messages`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${config.whatsappToken}` },
          body: JSON.stringify({ messaging_product: 'whatsapp', ...corpo }),
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) return;
        const txt = await res.text().catch(() => '');
        ultimoErro = new Error(`WhatsApp API ${res.status}: ${txt.slice(0, 300)}`);
        if (res.status < 500 && res.status !== 429) throw ultimoErro;
      } catch (e) {
        ultimoErro = e;
        if (/WhatsApp API 4(?!29)/.test(e.message)) throw e;
      }
      await dormir(500 * (tentativa + 1));
    }
    throw ultimoErro;
  }

  return {
    async enviarTexto(para, texto) {
      for (const parte of dividirTexto(texto)) {
        await chamar({ to: para, type: 'text', text: { body: parte, preview_url: false } });
      }
    },
    async marcarComoLida(messageId) {
      await chamar({ status: 'read', message_id: messageId });
    },
  };
}
