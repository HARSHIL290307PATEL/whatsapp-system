const express = require("express");
const cors = require("cors");
const { Client, LocalAuth } = require("whatsapp-web.js");
const QRCode = require("qrcode");

const app = express();
app.use(cors()); // Permissive CORS
app.options('*', cors());
app.use(express.json());

let qrCodeData = null;

// Create WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth(), // saves session
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

// QR event
client.on("qr", async (qr) => {
    console.log("📲 QR RECEIVED");
    qrCodeData = await QRCode.toDataURL(qr);
});

// Ready event
client.on("ready", () => {
    console.log("✅ WhatsApp Connected!");
    qrCodeData = null;
});

// Disconnected event
client.on("disconnected", () => {
    console.log("❌ WhatsApp Disconnected!");
    qrCodeData = null;
});

// Start client
client.initialize();


// ==================== APIs ====================

// Health Check
app.get('/', (req, res) => {
    res.send('WhatsApp Backend is Running 🚀');
});

// 1️⃣ Get QR Code (for login)
app.get("/api/qr", (req, res) => {
    if (!qrCodeData) {
        if (client.info) {
            return res.json({ status: "connected" });
        }
        return res.json({ status: "waiting" });
    }
    res.json({ status: "qr", qr: qrCodeData });
});

// 2️⃣ Check Connection
app.get("/api/status", (req, res) => {
    const isConnected = client.info ? true : false;
    res.json({ connected: isConnected });
});

// 3️⃣ Send Message
app.post("/api/send", async (req, res) => {
    const { number, message } = req.body;

    if (!number || !message) {
        return res.status(400).json({ error: "Number and message required" });
    }

    try {
        const chatId = number.includes("@c.us") ? number : `${number}@c.us`;
        await client.sendMessage(chatId, message);
        res.json({ success: true, message: "Message sent" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to send message", details: err.message });
    }
});

// Start Server
const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
