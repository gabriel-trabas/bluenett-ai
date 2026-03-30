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

// memória simples por número
const historicoPorNumero = new Map();

function extrairNumero(remoteJid = '') {
  return remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
}

function extrairTexto(payload) {
  const msg = payload?.data?.message || {};

  if (msg.conversation) return msg.conversation;
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  if (msg.imageMessage?.caption) return msg.imageMessage.caption;
  if (msg.videoMessage?.caption) return msg.videoMessage.caption;

  return '';
}

function mensagemValida(payload) {
  const remoteJid = payload?.data?.key?.remoteJid || '';
  const fromMe = payload?.data?.key?.fromMe;

  if (!remoteJid) return false;
  if (fromMe === true) return false;
  if (remoteJid.endsWith('@g.us')) return false;

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

  if (historico.length > 10) {
    historico.splice(0, historico.length - 10);
  }
}

async function gerarRespostaIA(numero) {
  const historico = obterHistorico(numero);

  const messages = [
    {
      role: 'system',
      content:
        'Você é a atendente virtual da Bluenett. Responda em português do Brasil, de forma curta, educada e útil. Não invente informações. Se não souber, diga que vai encaminhar para um atendente.'
    },
    ...historico
  ];

  console.log('🧠 Chamando Ollama...');
  console.log('🧠 Modelo:', OLLAMA_MODEL);

  const response = await axios.post(
    `${OLLAMA_URL}/api/chat`,
    {
      model: OLLAMA_MODEL,
      messages,
      stream: false,
      keep_alive: '10m'
    },
    {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 120000
    }
  );

  const resposta = response?.data?.message?.content?.trim();

  console.log('🧠 Resposta IA:', resposta);

  return resposta || 'Recebi sua mensagem. Vou te ajudar em seguida.';
}

async function enviarMensagemWhatsApp(numero, texto) {
  const url = `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`;

  console.log('📤 Enviando mensagem...');
  console.log('📤 Número:', numero);
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

  console.log('📤 Resposta Evolution:', response.data);

  return response.data;
}

app.get('/', (req, res) => {
  res.send('Servidor ok');
});

app.post('/webhook', async (req, res) => {
  try {
    console.log('📩 Webhook recebido:');
    console.log(JSON.stringify(req.body, null, 2));

    res.send('OK');

    const payload = req.body;

    if (!mensagemValida(payload)) {
      console.log('Mensagem ignorada.');
      return;
    }

    const remoteJid = payload?.data?.key?.remoteJid || '';
    const numero = extrairNumero(remoteJid);
    const textoRecebido = extrairTexto(payload);

    if (!numero || !textoRecebido) {
      console.log('Sem número ou texto válido.');
      return;
    }

    console.log('👤 Número:', numero);
    console.log('💬 Texto:', textoRecebido);

    adicionarNoHistorico(numero, 'user', textoRecebido);

    const respostaIA = await gerarRespostaIA(numero);

    adicionarNoHistorico(numero, 'assistant', respostaIA);

    const envio = await enviarMensagemWhatsApp(numero, respostaIA);

    console.log('✅ Mensagem enviada:', envio);

  } catch (error) {
    console.error('❌ Erro:', error.response?.data || error.message);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});