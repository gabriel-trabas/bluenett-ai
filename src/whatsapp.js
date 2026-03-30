const axios = require('axios');

async function sendWhatsAppMessage(number, text) {
  await axios.post(
    `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`,
    {
      number,
      text
    },
    {
      headers: {
        apikey: process.env.EVOLUTION_API_KEY,
        'Content-Type': 'application/json'
      }
    }
  );
}

module.exports = { sendWhatsAppMessage };