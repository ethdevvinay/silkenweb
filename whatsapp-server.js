const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const app = express();
const port = process.env.PORT || 3000;

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: 'sessions'
    })
});

let qrCode = null;
let qrGenerated = false;

client.on('qr', (qr) => {
    qrcode.toDataURL(qr, (err, url) => {
        qrCode = url;
        qrGenerated = true;
        console.log('QR code generated');
    });
});

client.on('ready', () => {
    console.log('Client is ready!');
});

client.on('auth_failure', (msg) => {
    console.error('Authentication failed:', msg);
});

client.on('disconnected', (reason) => {
    console.log('Client was logged out:', reason);
});

client.initialize();

app.use(express.json());

app.get('/qr-code', (req, res) => {
    if (!qrGenerated) {
        return res.status(404).send('QR code not available yet. Please try again in a few seconds.');
    }
    res.send(qrCode);
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
