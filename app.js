require('dotenv').config();
const express = require('express');
const axios = require('axios');

console.log('Iniciando app...');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const EVOLUTION_URL = process.env.EVOLUTION_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'bluenett';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma3:latest';

// memoria simples por numero
const historicoPorNumero = new Map();

function extrairNumero(remoteJid = '') {
  return remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
}

function extrairTexto(payload) {
  const msg = payload?.data?.message || {};

  if (msg.conversation) return msg.conversation;

  if (msg.extendedTextMessage?.text) {
    return msg.extendedTextMessage.text;
  }

  if (msg.imageMessage?.caption) {
    return msg.imageMessage.caption;
  }

  if (msg.videoMessage?.caption) {
    return msg.videoMessage.caption;
  }

  if (msg.buttonsResponseMessage?.selectedDisplayText) {
    return msg.buttonsResponseMessage.selectedDisplayText;
  }

  if (msg.listResponseMessage?.title) {
    return msg.listResponseMessage.title;
  }

  if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) {
    return msg.listResponseMessage.singleSelectReply.selectedRowId;
  }

  return '';
}

function mensagemValida(payload) {
  const remoteJid = payload?.data?.key?.remoteJid || '';
  const fromMe = payload?.data?.key?.fromMe;
  const event = payload?.event || '';
  const texto = extrairTexto(payload);

  console.log('🔎 event:', event);
  console.log('🔎 fromMe:', fromMe);
  console.log('🔎 remoteJid:', remoteJid);
  console.log('🔎 texto dentro da validacao:', texto);

  if (!remoteJid) {
    console.log('🚫 Mensagem sem remoteJid');
    return false;
  }

  if (fromMe === true) {
    console.log('🚫 Mensagem do proprio bot ignorada');
    return false;
  }

  if (remoteJid.includes('@g.us')) {
    console.log('🚫 Mensagem de grupo ignorada');
    return false;
  }

  if (!texto) {
    console.log('🚫 Mensagem sem texto');
    return false;
  }

  return true;
}

function obterHistorico(numero) {
  if (!historicoPorNumero.has(numero)) {
    historicoPorNumero.set(numero, []);
  }
  return historicoPorNumero.get(numero);
}

function adicionarNoHistorico(numero, role, content) {
  const historico = obterHistorico(numero);
  historico.push({ role, content });

  // deixa o historico curto para pesar menos
  if (historico.length > 4) {
    historico.splice(0, historico.length - 4);
  }
}

async function gerarRespostaIA(numero) {
  const historico = obterHistorico(numero);

  const messages = [
    {
      role: 'system',
      content:
        'Voce e a atendente virtual da Bluenett. Responda em portugues do Brasil, de forma curta, objetiva e educada. Nunca invente informacoes. Se nao souber, diga que vai encaminhar para um atendente.'
    },
    ...historico
  ];

  console.log('🧠 Chamando Ollama...');
  console.log('🧠 Modelo:', OLLAMA_MODEL);
  console.log('🧠 URL:', `${OLLAMA_URL}/api/chat`);

  const response = await axios.post(
    `${OLLAMA_URL}/api/chat`,
    {
      model: OLLAMA_MODEL,
      messages,
      stream: false,
      keep_alive: '10m',
      options: {
        num_predict: 80
      }
    },
    {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 300000
    }
  );

  console.log('🧠 Resposta bruta do Ollama:');
  console.log(JSON.stringify(response.data, null, 2));

  const resposta = response?.data?.message?.content?.trim();

  console.log('🧠 Resposta IA final:', resposta);

  return resposta || 'Recebi sua mensagem. Vou te ajudar em seguida.';
}

async function enviarMensagemWhatsApp(numero, texto) {
  const url = `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`;

  console.log('📤 Enviando mensagem para WhatsApp...');
  console.log('📤 URL:', url);
  console.log('📤 Numero:', numero);
  console.log('📤 Texto:', texto);

  const response = await axios.post(
    url,
    {
      number: numero,
      text: texto
    },
    {
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_API_KEY
      },
      timeout: 30000
    }
  );

  console.log('📤 Resposta da Evolution:');
  console.log(JSON.stringify(response.data, null, 2));

  return response.data;
}

app.get('/', (req, res) => {
  res.send('Servidor ok');
});

app.post('/webhook', async (req, res) => {
  try {
    console.log('📩 Webhook recebido:');
    console.log(JSON.stringify(req.body, null, 2));

    // responde rapido para a Evolution nao reenviar
    res.send('OK');

    const payload = req.body;

    console.log('🔎 Passo 1: validando mensagem...');

    if (!mensagemValida(payload)) {
      console.log('⛔ Saiu em mensagemValida()');
      return;
    }

    console.log('✅ Passo 2: mensagem valida');

    const remoteJid = payload?.data?.key?.remoteJid || '';
    const numero = extrairNumero(remoteJid);
    const textoRecebido = extrairTexto(payload);

    console.log('🔎 remoteJid:', remoteJid);
    console.log('🔎 numero:', numero);
    console.log('🔎 textoRecebido:', textoRecebido);

    if (!numero || !textoRecebido) {
      console.log('⛔ Saiu porque numero ou texto esta vazio');
      return;
    }

    if (textoRecebido.toLowerCase() === 'reset') {
      console.log('♻️ Resetando conversa');
      historicoPorNumero.delete(numero);
      await enviarMensagemWhatsApp(numero, 'Conversa reiniciada com sucesso.');
      return;
    }

    console.log('👤 Numero:', numero);
    console.log('💬 Texto recebido:', textoRecebido);

    adicionarNoHistorico(numero, 'user', textoRecebido);

    let respostaIA = '';

    try {
      console.log('🧠 Passo 3: chamando IA...');
      respostaIA = await gerarRespostaIA(numero);
      console.log('🧠 IA respondeu:', respostaIA);
    } catch (error) {
      console.error('❌ Erro ao chamar IA:', error.response?.data || error.message);
      respostaIA =
        'Recebi sua mensagem. Nosso atendimento virtual esta lento no momento, mas seu contato foi registrado.';
    }

    adicionarNoHistorico(numero, 'assistant', respostaIA);

    console.log('📤 Passo 4: enviando resposta no WhatsApp...');
    const envio = await enviarMensagemWhatsApp(numero, respostaIA);

    console.log('✅ Mensagem enviada:', envio);
  } catch (error) {
    console.error('❌ Erro no webhook:', error.response?.data || error.message);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});