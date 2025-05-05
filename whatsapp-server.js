const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const cors = require('cors');
const QRCode = require('qrcode');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*', // Allow all origins (update this for production)
        methods: ['GET', 'POST']
    }
});
const port = process.env.PORT || 3000;
const database = require('./database');

// Ensure session folder exists
if (!fs.existsSync('./sessions')) {
    fs.mkdirSync('./sessions');
}

// Enable CORS for all routes
app.use(cors({
    origin: '*',  // Allow all origins (you can replace * with your frontend URL)
    methods: ['GET', 'POST'],  // Allow only GET and POST requests
    allowedHeaders: ['Content-Type']  // Allow only specific headers
}));

let client;
let currentQR = null;
let isAuthenticated = false;

async function initializeWhatsAppClient() {
    try {
        // Check for existing session
        const savedSession = await database.getSession('whatsapp_session');
        
        client = new Client({
            authStrategy: new LocalAuth({
                dataPath: './sessions',
                clientId: 'silken_aesthetic'
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            }
        });

        client.on('qr', async (qr) => {
            console.log('QR Generated');
            currentQR = qr;
            isAuthenticated = false;
            
            try {
                // Generate QR Code Image
                const qrCodeImage = await QRCode.toDataURL(qr);
                await database.saveSession('current_qr', { qrImage: qrCodeImage });
                
                // Emit QR code to all connected clients
                io.emit('qr', qrCodeImage);
            } catch (error) {
                console.error('Error generating QR code:', error);
            }
        });

        client.on('authenticated', async (session) => {
            console.log('Authenticated');
            isAuthenticated = true;
            currentQR = null;
            
            try {
                await database.saveSession('whatsapp_session', session);
                io.emit('authenticated', true);
            } catch (error) {
                console.error('Error saving session:', error);
            }
        });

        client.on('ready', () => {
            console.log('Client is ready');
            isAuthenticated = true;
            currentQR = null;
            io.emit('ready');
            io.emit('connected', true);
        });

        client.on('auth_failure', (msg) => {
            console.error('Authentication failure:', msg);
            isAuthenticated = false;
            io.emit('auth_failure', msg);
        });

        client.on('disconnected', (reason) => {
            console.log('Client disconnected:', reason);
            isAuthenticated = false;
            io.emit('disconnected', reason);
            // Try to reinitialize after 5 seconds
            setTimeout(initializeWhatsAppClient, 5000);
        });

        await client.initialize();
    } catch (error) {
        console.error('Error initializing WhatsApp client:', error);
        // Try to reinitialize after 5 seconds
        setTimeout(initializeWhatsAppClient, 5000);
    }
}

app.use(express.json());

app.get('/', (req, res) => {
    res.send('WhatsApp server is running!');
});

app.get('/qr-code', (req, res) => {
    if (!currentQR) {
        return res.status(404).send('QR code not available yet. Please try again in a few seconds.');
    }
    res.send(currentQR);
});

app.get('/qr', async (req, res) => {
    try {
        const qrSession = await database.getSession('current_qr');
        if (qrSession && qrSession.qrImage) {
            res.json({ success: true, qr: qrSession.qrImage });
        } else {
            res.json({ success: false, message: 'No QR available' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/status', (req, res) => {
    res.json({ 
        authenticated: isAuthenticated,
        ready: client && client.info ? true : false,
        hasQR: currentQR !== null
    });
});

app.post('/send', async (req, res) => {
    try {
        const { phone, message } = req.body;

        if (!client || !client.info) {
            return res.status(400).json({ success: false, message: 'WhatsApp client not ready' });
        }

        const formattedPhone = phone.replace(/[^0-9]/g, '');
        const finalPhone = formattedPhone.length === 10 ? `91${formattedPhone}` : formattedPhone;
        const chatId = `${finalPhone}@c.us`;

        const result = await client.sendMessage(chatId, message);
        res.json({ success: true, message: 'Message sent successfully', result });
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
    
    // Send current state to new client
    if (currentQR) {
        socket.emit('qr', currentQR);
    }
    if (isAuthenticated) {
        socket.emit('authenticated', true);
    }
    if (client && client.info) {
        socket.emit('ready');
        socket.emit('connected', true);
    }
});

server.listen(port, () => {
    console.log(`WhatsApp server running at http://localhost:${port}`);
    initializeWhatsAppClient();
}); 
