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
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

async function initializeWhatsAppClient() {
    try {
        // Clear any existing client
        if (client) {
            await client.destroy();
            client = null;
        }

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
                    '--disable-gpu',
                    '--disable-extensions',
                    '--disable-default-apps',
                    '--disable-translate',
                    '--disable-sync',
                    '--disable-background-networking',
                    '--metrics-recording-only',
                    '--mute-audio',
                    '--no-default-browser-check',
                    '--safebrowsing-disable-auto-update'
                ]
            },
            qrMaxRetries: 5,
            authTimeoutMs: 60000,
            restartOnAuthFail: true
        });

        client.on('qr', async (qr) => {
            console.log('QR Generated');
            currentQR = qr;
            isAuthenticated = false;
            reconnectAttempts = 0;
            
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
            reconnectAttempts = 0;
            
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
            reconnectAttempts = 0;
            io.emit('ready');
            io.emit('connected', true);
        });

        client.on('auth_failure', (msg) => {
            console.error('Authentication failure:', msg);
            isAuthenticated = false;
            io.emit('auth_failure', msg);
            
            // Clear session on auth failure
            database.deleteSession('whatsapp_session');
            database.deleteSession('current_qr');
        });

        client.on('disconnected', async (reason) => {
            console.log('Client disconnected:', reason);
            isAuthenticated = false;
            io.emit('disconnected', reason);

            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
                setTimeout(initializeWhatsAppClient, 5000);
            } else {
                console.log('Max reconnection attempts reached. Please restart the server.');
                io.emit('max_reconnect_attempts');
            }
        });

        await client.initialize();
    } catch (error) {
        console.error('Error initializing WhatsApp client:', error);
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
            setTimeout(initializeWhatsAppClient, 5000);
        }
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
        hasQR: currentQR !== null,
        reconnectAttempts: reconnectAttempts
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

// Add new endpoint to force reconnection
app.post('/reconnect', async (req, res) => {
    try {
        reconnectAttempts = 0;
        await initializeWhatsAppClient();
        res.json({ success: true, message: 'Reconnection initiated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
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
