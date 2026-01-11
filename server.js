const express = require("express");
const cors = require("cors");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const qrcodeTerminal = require("qrcode-terminal");

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

    // Generate QR in terminal
    qrcodeTerminal.generate(qr, { small: true });
    console.log("👉 Scan the QR code above to login!");

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
        message: "WhatsApp API is running fine (v5: OOM Fix + Cleanup)"
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

    console.log(`📩 Send Request: Number="${number}", Message="${message?.substring(0, 10)}..."`);

    if (!isReady) {
        return res.status(400).json({ success: false, message: "WhatsApp not connected" });
    }

    if (!number || !message) {
        return res.status(400).json({ success: false, message: "Number and message required" });
    }

    try {
        // Strict Sanitization: Remove ALL non-digit characters
        let sanitized_number = number.toString().replace(/\D/g, "");

        if (!sanitized_number) {
            return res.status(400).json({ success: false, message: "Invalid phone number (no digits)" });
        }

        // Auto-append 91 if it's a 10-digit number (Likely Indian format)
        if (sanitized_number.length === 10) {
            sanitized_number = "91" + sanitized_number;
        }

        console.log(`🚀 Processing number: ${sanitized_number}`);

        let internal_id;
        try {
            internal_id = await client.getNumberId(sanitized_number);
        } catch (e) {
            console.warn("⚠️ getNumberId failed, falling back to chatId construction", e.message);
        }

        if (!internal_id) {
            const chatId = `${sanitized_number}@c.us`;
            console.log(`⚠️ Using constructed chatId: ${chatId}`);
            await client.sendMessage(chatId, message);
        } else {
            console.log(`✅ Using internal_id: ${internal_id._serialized}`);
            await client.sendMessage(internal_id._serialized, message);
        }

        res.json({ success: true, message: "Message sent" });
    } catch (err) {
        console.error("❌ Send Error:", err);
        res.status(500).json({
            success: false,
            error: err.message || "Unknown Error",
            details: "Failed to send message via WhatsApp client"
        });
    }
});

// Start Server
const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
