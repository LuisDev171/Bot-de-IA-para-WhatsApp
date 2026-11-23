import { loadConfig, loadNegocio } from './config.js';
import { criarLog } from './log.js';
import { Store } from './store.js';
import { criarIA } from './ai.js';
import { criarWhatsApp } from './whatsapp.js';
import { criarBot } from './bot.js';
import { criarServidor } from './server.js';

const log = criarLog(process.env.LOG_LEVEL || 'info');

let config;
let negocio;
try {
  config = loadConfig();
  negocio = loadNegocio(config.negocioFile);
} catch (e) {
  console.error(`\nErro de configuração: ${e.message}\n`);
  process.exit(1);
}

const store = new Store({ file: config.stateFile });
store.carregar();
store.iniciarAutoSave();

const whatsapp = criarWhatsApp({ config });
const ia = criarIA({ config });

async function notificar(texto) {
  log('info', 'aviso para a equipe', { texto });
  const tarefas = [];
  if (config.ownerPhone) tarefas.push(whatsapp.enviarTexto(config.ownerPhone, texto));
  if (config.notifyWebhookUrl) {
    tarefas.push(
      fetch(config.notifyWebhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: texto, content: texto }),
        signal: AbortSignal.timeout(10_000),
      }),
    );
  }
  const resultados = await Promise.allSettled(tarefas);
  for (const r of resultados) if (r.status === 'rejected') log('warn', 'falha ao avisar a equipe', { erro: String(r.reason) });
}

const bot = criarBot({ config, negocio, store, whatsapp, ia, log, notificar });
const servidor = criarServidor({ config, bot, log });

servidor.listen(config.port, () => log('info', `Bot de ${negocio.nome} no ar`, { porta: config.port, modelo: config.model }));

const encerrar = () => {
  log('info', 'encerrando');
  store.parar();
  servidor.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);
process.on('unhandledRejection', (e) => log('error', 'promessa rejeitada', { erro: String(e) }));
