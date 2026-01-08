const express = require("express");
const cors = require("cors");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");

const app = express();

// Global Error Handlers (Prevent Crash)
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, p) => {
    console.error('UNHANDLED REJECTION:', reason);
});

// ✅ ENABLE CORS FIRST
app.use(cors({
    origin: [
        "http://localhost:8080",
        "http://localhost:4000",
        "http://localhost:5173",
        "https://hostel-hub-admin-3c54.vercel.app",
        "https://hostel-hub-admin-opal.vercel.app"
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));

app.use(express.json());

let isReady = false;

// Initialize WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth(),
    // Initialize WhatsApp Client
    const client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process', // Critical for 512MB environments
                '--disable-gpu',
                '--renderer-process-limit=1', // Limit renderers
                '--disable-extensions'
            ]
        }
    });

    client.on("qr", async (qr) => {
        console.log("📲 QR RECEIVED");
        global.qrCode = await qrcode.toDataURL(qr);
    });

    client.on("ready", () => {
        console.log("✅ WhatsApp Connected");
        isReady = true;
    });

    client.on("disconnected", () => {
        console.log("❌ WhatsApp Disconnected");
        isReady = false;
        global.qrCode = null;
    });

    // Start client
    client.initialize();

    // ==================== APIs ====================

    // Test Route
    app.get("/", (req, res) => {
        res.status(200).json({
            success: true,
            message: "WhatsApp API is running fine (v3: Kick Render)"
        });
    });

    // 📌 Get QR Code
    app.get("/api/qr", (req, res) => {
        if (isReady) {
            return res.json({ success: true, message: "Already connected" });
        }
        if (global.qrCode) {
            return res.json({ success: true, qr: global.qrCode });
        }
        res.json({ success: false, message: "QR not generated yet" });
    });

    // 📌 Check Connection Status
    app.get("/api/status", (req, res) => {
        res.json({
            success: true,
            connected: isReady
        });
    });

    // 📌 Send Message API
    app.post("/api/send", async (req, res) => {
        const { number, message } = req.body;

        if (!isReady) {
            return res.status(400).json({ success: false, message: "WhatsApp not connected" });
        }

        if (!number || !message) {
            return res.status(400).json({ success: false, message: "Number and message required" });
        }

        try {
            const sanitized_number = number.toString().replace(/[- )(]/g, "").replace(/\+/g, "");
            const internal_id = await client.getNumberId(sanitized_number);

            if (!internal_id) {
                const chatId = `${sanitized_number}@c.us`;
                await client.sendMessage(chatId, message);
            } else {
                await client.sendMessage(internal_id._serialized, message);
            }

            res.json({ success: true, message: "Message sent" });
        } catch (err) {
            console.error("❌ Send Error:", err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // Start Server
    const PORT = process.env.PORT || 4000;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running on port ${PORT}`);
    });
