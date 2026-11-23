# Bot de Atendimento no WhatsApp com IA

Atende seus clientes no WhatsApp 24h, tira dúvidas, informa preços e horários, coleta dados de agendamento e **passa para um humano** quando necessário.

- Usa a **API oficial do WhatsApp (Cloud API da Meta)**, sem o risco de banimento de bots não oficiais.
- IA da Anthropic (Claude), com modelo configurável.
- **Zero dependências**: só precisa do Node.js 20.6 ou superior.
- Valida a assinatura dos webhooks, ignora mensagens duplicadas, tem limite anti-spam, fila por cliente, reenvio automático em falhas e mensagem de contingência quando a IA cai.

## 1. Personalizar para o cliente

Edite **`config/negocio.json`**: nome da empresa, nome da atendente, horários, serviços e preços, FAQ, regras e tom de voz. O bot só responde com base no que estiver lá e passa para um humano quando não souber.

Teste a conversa no terminal, sem WhatsApp:

```bash
cp .env.example .env      # preencha pelo menos ANTHROPIC_API_KEY
npm run simular
```

## 2. Configurar o WhatsApp (uma vez)

1. Em [developers.facebook.com](https://developers.facebook.com) crie um app do tipo **Empresa** e adicione o produto **WhatsApp**.
2. Em **WhatsApp > Configuração da API** copie o **Phone number ID** (`WHATSAPP_PHONE_ID`).
3. Gere um **token permanente**: Configurações da empresa > Usuários do sistema > crie um usuário, atribua o app e gere o token com as permissões `whatsapp_business_messaging` e `whatsapp_business_management` (`WHATSAPP_TOKEN`).
4. Em **Configurações do app > Básico** copie o **App Secret** (`APP_SECRET`).
5. Invente um texto secreto para `VERIFY_TOKEN`.
6. Preencha o `.env` (modelo em `.env.example`).

## 3. Publicar o bot

O webhook precisa de uma URL pública com **HTTPS**. Opções simples: Railway, Render, Fly.io ou um VPS.

**Com Docker (recomendado):**

```bash
docker compose up -d --build
```

**Sem Docker:**

```bash
npm start
```

Depois, no painel da Meta, em **WhatsApp > Configuração > Webhook**:

- URL de retorno: `https://SEU-DOMINIO/webhook`
- Token de verificação: o mesmo `VERIFY_TOKEN`
- Clique em verificar e **assine o campo `messages`**.

Mande uma mensagem para o número e o bot responde.

## 4. Atendimento humano

Quando o cliente pede uma pessoa, reclama ou o bot não sabe responder, ele avisa o cliente, **fica em silêncio por `HANDOFF_HORAS`** (padrão 12h) e notifica a equipe por:

- WhatsApp para o `OWNER_PHONE`. **Atenção:** a Meta só deixa o bot escrever para um número que tenha mandado mensagem nas últimas 24h; mande um "oi" para o número do bot de vez em quando.
- Webhook de Slack ou Discord em `NOTIFY_WEBHOOK_URL` (mais confiável).

Comandos que o dono pode mandar para o número do bot (só funcionam a partir do `OWNER_PHONE`):

| Comando | O que faz |
|---|---|
| `/retomar 5512999999999` | reativa o bot para aquele cliente |
| `/pausar 5512999999999` | pausa o bot para aquele cliente |
| `/status` | mostra conversas ativas e clientes pausados |

## 5. Custos e limites

- A IA cobra por uso. O modelo `claude-haiku-5-5` é o mais econômico. Acompanhe em console.anthropic.com e defina um limite de gasto.
- A Meta cobra por conversas iniciadas pela empresa; as iniciadas pelo cliente têm janela de 24h para resposta. Confira a tabela de preços atual da Meta.
- Para usar um número oficial em produção, a Meta exige verificação da empresa.

## 6. Privacidade (LGPD)

O bot se identifica como assistente virtual quando perguntado e nunca pede dados sensíveis. As conversas ficam em `data/state.json` e são apagadas após 24h de inatividade. Informe os clientes sobre o atendimento automatizado na política de privacidade do negócio.

## Estrutura

```
config/negocio.json   dados do negócio (o que o cliente edita)
src/prompt.js         instruções da IA
src/bot.js            lógica de atendimento, handoff, anti-spam
src/server.js         webhook (verificação + assinatura)
src/ai.js             chamada à IA
src/whatsapp.js       envio pela Cloud API
src/store.js          conversas e pausas
scripts/simular.js    conversa no terminal
test/                 testes automatizados
```

Rodar os testes: `npm test`
