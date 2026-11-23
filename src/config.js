import fs from 'node:fs';

export function loadConfig(env = process.env, { whatsapp = true } = {}) {
  const obrigatorias = ['ANTHROPIC_API_KEY'];
  if (whatsapp) obrigatorias.push('WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID', 'VERIFY_TOKEN', 'APP_SECRET');
  const faltando = obrigatorias.filter((k) => !env[k] || env[k].startsWith('cole_') || env[k].startsWith('invente_'));
  if (faltando.length) {
    throw new Error(`Preencha no arquivo .env: ${faltando.join(', ')}`);
  }
  const num = (v, padrao) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : padrao);
  return {
    port: num(env.PORT, 3000),
    whatsappToken: env.WHATSAPP_TOKEN,
    phoneId: env.WHATSAPP_PHONE_ID,
    verifyToken: env.VERIFY_TOKEN,
    appSecret: env.APP_SECRET,
    anthropicKey: env.ANTHROPIC_API_KEY,
    model: env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
    ownerPhone: (env.OWNER_PHONE || '').replace(/\D/g, '') || null,
    notifyWebhookUrl: env.NOTIFY_WEBHOOK_URL || null,
    handoffMs: num(env.HANDOFF_HORAS, 12) * 3600e3,
    limitePorMinuto: num(env.LIMITE_MSG_POR_MINUTO, 12),
    negocioFile: env.NEGOCIO_FILE || 'config/negocio.json',
    stateFile: env.STATE_FILE === undefined ? 'data/state.json' : env.STATE_FILE || null,
    timezone: env.TZ || 'America/Sao_Paulo',
  };
}

export function loadNegocio(file) {
  const dados = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const campo of ['nome', 'atendente', 'descricao']) {
    if (!dados[campo]) throw new Error(`config/negocio.json: campo "${campo}" é obrigatório`);
  }
  return dados;
}
