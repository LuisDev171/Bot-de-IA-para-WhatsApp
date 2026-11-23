export const mascarar = (tel = '') => (tel.length > 4 ? `***${tel.slice(-4)}` : '***');

export function criarLog(nivelMinimo = 'info') {
  const ordem = { debug: 0, info: 1, warn: 2, error: 3 };
  return (nivel, msg, extra = {}) => {
    if (ordem[nivel] < ordem[nivelMinimo]) return;
    console.log(JSON.stringify({ t: new Date().toISOString(), nivel, msg, ...extra }));
  };
}
