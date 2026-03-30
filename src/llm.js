const axios = require('axios');

async function askModel(userMessage) {
  const prompt = `
Você é a assistente virtual da Bluenett Gráfica, em Salvador.

Seu trabalho é atender clientes pelo WhatsApp.
Sempre tente descobrir:
- produto desejado
- quantidade
- tamanho ou medida
- prazo
- se a arte está pronta

Nunca invente preços.
Se o cliente pedir preço, diga que um atendente humano vai concluir o orçamento.
Responda de forma curta, educada e objetiva.

Mensagem do cliente: ${userMessage}
`;

  const response = await axios.post(`${process.env.OLLAMA_URL}/api/generate`, {
    model: process.env.OLLAMA_MODEL,
    prompt,
    stream: false
  });

  return response.data.response;
}

module.exports = { askModel };