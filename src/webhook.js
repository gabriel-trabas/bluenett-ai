const { askModel } = require('./llm');
const { sendWhatsAppMessage } = require('./whatsapp');

async function handleWebhook(req, res) {
  try {
    const body = req.body;

    const number = body?.data?.key?.remoteJid?.replace('@s.whatsapp.net', '');
    const userMessage = body?.data?.message?.conversation;

    if (!number || !userMessage) {
      return res.sendStatus(200);
    }

    const answer = await askModel(userMessage);
    await sendWhatsAppMessage(number, answer);

    return res.sendStatus(200);
  } catch (error) {
    console.error(error);
    return res.sendStatus(500);
  }
}

module.exports = { handleWebhook };