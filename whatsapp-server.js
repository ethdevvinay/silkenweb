const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const cors = require('cors');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*', // Allow all origins (update this for production)
        methods: ['GET', 'POST']
    }
});
const port = process.env.PORT || 3000;

// Ensure session folder exists
if (!fs.existsSync('./session')) {
    fs.mkdirSync('./session');
}

// Enable CORS for all routes
app.use(cors({
    origin: '*',  // Allow all origins (you can replace * with your frontend URL)
    methods: ['GET', 'POST'],  // Allow only GET and POST requests
    allowedHeaders: ['Content-Type']  // Allow only specific headers
}));

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './session' }),  // Ensure session is saved in ./session folder
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let qrCode = null;
let qrGenerated = false;
let currentQR = null;

client.on('qr', (qr) => {
    console.log('QR RECEIVED:', qr);
    currentQR = qr;
});

client.on('authenticated', () => {
    console.log('AUTHENTICATED');
    io.emit('ready'); // Notify clients when ready
    io.emit('connected', true); // Emit 'connected' event
});

client.on('auth_failure', (msg) => {
    console.error('AUTHENTICATION FAILED:', msg);
    io.emit('auth_failure', msg); // Notify clients of auth failure
});

client.on('ready', () => {
    console.log('CLIENT READY');
    io.emit('ready'); // Notify clients when ready
    io.emit('connected', true); // Emit 'connected' event
});

client.on('disconnected', (reason) => {
    console.log('CLIENT DISCONNECTED:', reason);
    qrGenerated = false; // Reset QR code status
    io.emit('disconnected', reason); // Notify clients of disconnection
    io.emit('connected', false); // Emit 'connected' event
});

client.initialize();

app.use(express.json());

app.get('/', (req, res) => {
    res.send('WhatsApp server is running!');
});

app.get('/qr-code', (req, res) => {
    if (!qrGenerated) {
        return res.status(404).send('QR code not available yet. Please try again in a few seconds.');
    }
    res.send(qrCode);
});

app.get('/qr', (req, res) => {
    if (!currentQR) {
        return res.status(404).json({ success: false, message: 'QR code not available' });
    }
    res.json({ success: true, qr: currentQR });
});

app.get('/status', (req, res) => {
    res.json({ authenticated: client.info ? true : false });
});

app.post('/send', express.json(), async (req, res) => {
    try {
        const { phone, message, file } = req.body;
        
        if (!client.info) {
            throw new Error('WhatsApp client is not authenticated');
        }

        // Validate phone number
        const formattedPhone = phone.replace(/[^0-9]/g, '');
        const finalPhone = formattedPhone.length === 10 ? `91${formattedPhone}` : formattedPhone;
        const chatId = `${finalPhone}@c.us`;

        // Send message
        const result = await client.sendMessage(chatId, message);
        res.json({ success: true, message: 'Message sent successfully', data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/send-invoice', async (req, res) => {
    try {
        const { to } = req.body;
        const filePath = 'path/to/invoice.pdf';

        if (!fs.existsSync(filePath)) {
            return res.status(404).send('File not found!');
        }

        const file = fs.readFileSync(filePath);
        const base64File = file.toString('base64');
        const media = new MessageMedia('application/pdf', base64File, 'invoice.pdf');

        await client.sendMessage(to, media, { caption: 'Here is your invoice.' });
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
        socket.emit('connected', true); // Notify new clients if already connected
    }
});

server.listen(port, () => {
    console.log(`WhatsApp server running at http://localhost:${port}`);
}); 
