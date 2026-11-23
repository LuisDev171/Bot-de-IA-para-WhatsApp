// Quebra textos longos em partes que cabem no WhatsApp (limite real: 4096 caracteres)
export function dividirTexto(texto, max = 3500) {
  const partes = [];
  let resto = String(texto).trim();
  while (resto.length > max) {
    let corte = resto.lastIndexOf('\n\n', max);
    if (corte < max * 0.4) corte = resto.lastIndexOf('\n', max);
    if (corte < max * 0.4) corte = resto.lastIndexOf(' ', max);
    if (corte <= 0) corte = max;
    partes.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trim();
  }
  if (resto) partes.push(resto);
  return partes;
}

// Garante histórico válido para a API: começa com "user", alterna papéis, tamanho limitado
export function normalizarHistorico(msgs, max = 20) {
  const recorte = msgs.slice(-max);
  const out = [];
  for (const m of recorte) {
    if (!m.content) continue;
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.role === m.role) ultimo.content += `\n${m.content}`;
    else out.push({ role: m.role, content: m.content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
