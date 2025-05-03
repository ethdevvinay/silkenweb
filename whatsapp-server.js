const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*', // Allow all origins (update this for production)
        methods: ['GET', 'POST']
    }
});
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
        if (err) {
            console.error('Failed to generate QR code:', err);
            return;
        }
        qrCode = url;
        qrGenerated = true;
        console.log('QR code generated');
        io.emit('qr', url); // Send QR code to clients via WebSocket
    });
});

client.on('ready', () => {
    console.log('Client is ready!');
    io.emit('ready'); // Notify clients when ready
});

client.on('auth_failure', (msg) => {
    console.error('Authentication failed:', msg);
    io.emit('auth_failure', msg); // Notify clients of auth failure
});

client.on('disconnected', (reason) => {
    console.log('Client was logged out:', reason);
    qrGenerated = false; // Reset QR code status
    io.emit('disconnected', reason); // Notify clients of disconnection
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

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    if (qrGenerated) {
        socket.emit('qr', qrCode); // Send existing QR code to new clients
    }
    if (client.info) {
        socket.emit('ready'); // Notify new clients if already ready
    }
});

server.listen(port, () => {
    console.log(`WhatsApp server running at http://localhost:${port}`);
}); 
