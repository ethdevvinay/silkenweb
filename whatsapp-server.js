const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const app = express();
const port = 3000;

const client = new Client({
    authStrategy: new LocalAuth()
});

let qrCode = null;

client.on('qr', (qr) => {
    qrcode.toDataURL(qr, (err, url) => {
        qrCode = url;
    });
});

client.on('ready', () => {
    console.log('Client is ready!');
});

client.initialize();

app.use(express.json());

app.get('/qr-code', (req, res) => {
    if (qrCode) {
        res.send(qrCode);
    } else {
        res.status(404).send('QR code not available');
    }
});

app.get('/status', (req, res) => {
    res.json({ authenticated: client.info !== undefined });
});

app.post('/send-message', async (req, res) => {
    try {
        const { to, message } = req.body;
        const chatId = to.includes('@') ? to : `${to}@c.us`;
        await client.sendMessage(chatId, message);
        res.sendStatus(200);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.listen(port, () => {
    console.log(`WhatsApp server running at http://localhost:${port}`);
}); 