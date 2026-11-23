import fs from 'node:fs';
import path from 'node:path';

// Guarda conversas e clientes pausados (atendimento humano). Persiste em arquivo JSON se `file` for informado.
export class Store {
  constructor({ file = null, ttlMs = 24 * 3600e3, maxMsgs = 20 } = {}) {
    this.file = file;
    this.ttlMs = ttlMs;
    this.maxMsgs = maxMsgs;
    this.conversas = new Map(); // tel -> { msgs: [{role, content}], ts }
    this.pausados = new Map(); // tel -> timestamp até quando
    this.sujo = false;
    this.timer = null;
  }

  carregar() {
    if (!this.file || !fs.existsSync(this.file)) return;
    try {
      const d = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const [k, v] of Object.entries(d.conversas ?? {})) this.conversas.set(k, v);
      for (const [k, v] of Object.entries(d.pausados ?? {})) this.pausados.set(k, v);
      this.limpar();
    } catch {
      // arquivo corrompido: começa do zero em vez de derrubar o bot
    }
  }

  salvar() {
    if (!this.file || !this.sujo) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(
      tmp,
      JSON.stringify({ conversas: Object.fromEntries(this.conversas), pausados: Object.fromEntries(this.pausados) }),
    );
    fs.renameSync(tmp, this.file);
    this.sujo = false;
  }

  iniciarAutoSave(intervaloMs = 5000) {
    this.timer = setInterval(() => {
      this.limpar();
      this.salvar();
    }, intervaloMs);
    this.timer.unref?.();
  }

  parar() {
    clearInterval(this.timer);
    this.salvar();
  }

  historico(tel) {
    return this.conversas.get(tel)?.msgs ?? [];
  }

  adicionar(tel, role, content) {
    const c = this.conversas.get(tel) ?? { msgs: [], ts: 0 };
    c.msgs.push({ role, content });
    if (c.msgs.length > this.maxMsgs * 2) c.msgs = c.msgs.slice(-this.maxMsgs * 2);
    c.ts = Date.now();
    this.conversas.set(tel, c);
    this.sujo = true;
  }

  pausar(tel, ms) {
    this.pausados.set(tel, Date.now() + ms);
    this.sujo = true;
  }

  retomar(tel) {
    const existia = this.pausados.delete(tel);
    this.sujo = true;
    return existia;
  }

  estaPausado(tel) {
    const ate = this.pausados.get(tel);
    if (!ate) return false;
    if (ate < Date.now()) {
      this.pausados.delete(tel);
      this.sujo = true;
      return false;
    }
    return true;
  }

  limpar() {
    const agora = Date.now();
    for (const [k, v] of this.conversas) if (agora - v.ts > this.ttlMs) this.conversas.delete(k);
    for (const [k, v] of this.pausados) if (v < agora) this.pausados.delete(k);
    this.sujo = true;
  }
}
