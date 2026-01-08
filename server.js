require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const cors = require('cors');
const cron = require('node-cron');
const fs = require('fs');

const app = express();
app.use(cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"]
}));
app.use(express.json());

const sessions = {};   // userId -> whatsapp client
const qrCodes = {};    // userId -> qr
const ready = {};      // userId -> boolean

// Create WhatsApp session per user
function createSession(userId) {
    const client = new Client({
        authStrategy: new LocalAuth({ clientId: userId }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu'
            ]
        }
    });

    client.on('qr', async (qr) => {
        qrCodes[userId] = await QRCode.toDataURL(qr);
        ready[userId] = false;
        console.log(`📲 QR generated for ${userId}`);
    });

    client.on('ready', () => {
        ready[userId] = true;
        console.log(`✅ ${userId} connected`);
    });

    client.on('disconnected', () => {
        ready[userId] = false;
        qrCodes[userId] = null;
        console.log(`❌ ${userId} disconnected`);
    });

    client.initialize();
    sessions[userId] = client;
}

/* ===========================
   API ROUTES
=========================== */

// Start new session
app.post('/api/session/start', (req, res) => {
    const { userId } = req.body;
    if (!sessions[userId]) {
        createSession(userId);
    }
    res.json({ success: true, message: "Session started" });
});

// Get QR
app.get('/api/qr/:userId', (req, res) => {
    const { userId } = req.params;

    if (ready[userId]) {
        return res.json({ status: "connected" });
    }

    if (!qrCodes[userId]) {
        return res.json({ status: "waiting" });
    }

    res.json({ status: "qr", qr: qrCodes[userId] });
});

// Send Message
app.post('/api/send', async (req, res) => {
    const { userId, number, message } = req.body;

    if (!ready[userId]) {
        return res.status(400).json({ error: "WhatsApp not connected" });
    }

    try {
        const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
        await sessions[userId].sendMessage(chatId, message);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});




cron.schedule('0 9 * * *', async () => {
    console.log("🎂 Running birthday check...");

    const today = new Date();
    const dayMonth = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    const birthdays = JSON.parse(fs.readFileSync('./birthdays.json'));

    for (let person of birthdays) {
        if (person.date === dayMonth && ready[person.userId]) {
            const chatId = `${person.number}@c.us`;
            const msg = `🎉 Happy Birthday ${person.name}! Have a great day! 🎂`;
            await sessions[person.userId].sendMessage(chatId, msg);
            console.log(`✅ Birthday wish sent to ${person.name}`);
        }
    }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Backend running on ${PORT}`));
