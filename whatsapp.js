const makeWASocket = require("@whiskeysockets/baileys").default;
const { useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const Pino = require("pino");
const QRCode = require("qrcode");
const NodeCache = require("node-cache");

let sock = null;
let isInitializing = false;
const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });

async function initWhatsApp() {
  if (sock || isInitializing) return sock;
  isInitializing = true;

  const { state, saveCreds } = await useMultiFileAuthState("auth_info");

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    browser: ["NodeJS API", "Chrome", "1.0"],
    logger: Pino({ level: "silent" }),
    cachedGroupMetadata: async (jid) => groupCache.get(jid),
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("groups.update", async ([event]) => {
    if (!sock) return;
    const metadata = await sock.groupMetadata(event.id || "");
    groupCache.set(event.id || "", metadata);
  });

  sock.ev.on("group-participants.update", async (event) => {
    if (!sock) return;
    const metadata = await sock.groupMetadata(event.id);
    groupCache.set(event.id, metadata);
  });

  // connection updates
  sock.ev.on("connection.update", async ({ qr, connection, lastDisconnect }) => {
    if (qr) {
      const qrUrl = await QRCode.toDataURL(qr);
      console.log("Scan QR Code (URL):", qrUrl);
    }
 
    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log("Connection closed, reason:", reason);
      sock = null;
      isInitializing = false;
      if (reason !== DisconnectReason.loggedOut) {
        console.log("Reconnecting...");
        initWhatsApp();
      }
    }

    if (connection === "open") {
      console.log("✅ WhatsApp connected");
    }
  });

  isInitializing = false;
  return sock;
}

function getSock() {
  if (!sock) throw new Error("WhatsApp not initialized");
  return sock;
}

module.exports = { initWhatsApp, getSock };
