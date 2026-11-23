// Conversa com o bot no terminal, sem WhatsApp. Útil para testar o prompt e demonstrar ao cliente.
import readline from 'node:readline/promises';
import { loadConfig, loadNegocio } from '../src/config.js';
import { criarIA } from '../src/ai.js';
import { montarPrompt, MARCADOR_HUMANO } from '../src/prompt.js';
import { normalizarHistorico } from '../src/util.js';

const config = loadConfig(process.env, { whatsapp: false });
const negocio = loadNegocio(config.negocioFile);
const ia = criarIA({ config });
const historico = [];
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log(`\nSimulador - ${negocio.nome} (digite "sair" para encerrar)\n`);
while (true) {
  const entrada = (await rl.question('Você: ')).trim();
  if (!entrada) continue;
  if (entrada.toLowerCase() === 'sair') break;
  historico.push({ role: 'user', content: entrada });
  try {
    const r = await ia({ system: montarPrompt(negocio, { timezone: config.timezone }), mensagens: normalizarHistorico(historico) });
    historico.push({ role: 'assistant', content: r.replaceAll(MARCADOR_HUMANO, '').trim() });
    console.log(`\n${negocio.atendente}: ${r.replaceAll(MARCADOR_HUMANO, '').trim()}${r.includes(MARCADOR_HUMANO) ? '\n   [passaria para atendimento humano]' : ''}\n`);
  } catch (e) {
    console.log(`\nErro: ${e.message}\n`);
  }
}
rl.close();
