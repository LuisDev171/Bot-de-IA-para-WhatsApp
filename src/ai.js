import { dormir } from './util.js';

const URL_API = 'https://api.anthropic.com/v1/messages';

export function criarIA({ config, fetchImpl = fetch }) {
  return async function gerarResposta({ system, mensagens }) {
    let ultimoErro;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      try {
        const res = await fetchImpl(URL_API, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': config.anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({ model: config.model, max_tokens: 600, system, messages: mensagens }),
          signal: AbortSignal.timeout(25_000),
        });
        if (res.ok) {
          const data = await res.json();
          const texto = (data.content ?? [])
            .filter((b) => b.type === 'text')
            .map((b) => b.text)
            .join('\n')
            .trim();
          if (!texto) throw new Error('Resposta da IA veio vazia');
          return texto;
        }
        const corpo = await res.text().catch(() => '');
        ultimoErro = new Error(`API da IA respondeu ${res.status}: ${corpo.slice(0, 200)}`);
        if (res.status < 500 && res.status !== 429) throw ultimoErro;
      } catch (e) {
        ultimoErro = e;
        if (/API da IA respondeu 4(?!29)/.test(e.message)) throw e;
      }
      await dormir(600 * (tentativa + 1));
    }
    throw ultimoErro;
  };
}
