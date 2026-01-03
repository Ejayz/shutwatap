const express = require("express");
const cors = require("cors");
const { initWhatsApp, getSock } = require("./whatsapp");
const redis = require("redis");
const app = express();
const puppeteer = require("puppeteer");
app.use(cors());
app.use(express.json());
const { getCurrentTimestamp } = require("./timestamp");
const PORT = process.env.PORT || 3000;

initWhatsApp().then(() => console.log("WhatsApp initialized"));

const Alerts = [];

app.get("/send", async (req, res) => {
  try {
    timestamp = getCurrentTimestamp();
    if (Alerts.length === 0) {
      console.log("No alerts in queue ", timestamp);
      return res.json({
        success: true,
        message: "No alerts in queue",
        timestamp,
      });
    } else {
      const { to, message } = Alerts.shift();
      console.log("Processing alert:", { to, message }, timestamp);
      if (!to || !message) {
        return res
          .status(400)
          .json({ error: "Missing 'to' or 'message' parameter" });
      }

      const sock = getSock();

      const sends = await sock.sendMessage(`${to}`, { text: message });

      // Baileys returns an object with 'key' containing 'id' and 'remoteJid'
      if (sends?.key?.id) {
        console.log("Message sent successfully:");

        return res.json({ success: true, id: sends.key.id, timestamp });
      } else {
        console.log("Message failed to send:", timestamp);
        Alerts.push({ to, message }); // Re-queue the alert
        return res
          .status(500)
          .json({ success: false, error: "Message failed to send" });
      }
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/groups", async (req, res) => {
  try {
    const sock = getSock();
    const groups = await sock.groupFetchAllParticipating();
    const groupList = Object.values(groups).map((group) => ({
      id: group.id,
      name: group.subject,
    }));
    res.json(groupList);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/queuealert", async (req, res) => {
  try {
    console.log("Received alert queue request:", req.body);
    const { to, message } = req.body;
    if (!to || !message) {
      return res
        .status(400)
        .json({ error: "Missing 'to' or 'message' in request body" });
    }
    Alerts.push({ to, message });
    res.json({ success: true, message: "Alert queued" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/test", async (req, res) => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto("https://google.com", { waitUntil: "networkidle0" });
  await page.setViewport({
    width: 1080,
    height: 1024,
  });
  const screenshot = await page.screenshot({
    path: "lazy.png",
     clip: { x: 100, y: 200, width: 500, height: 300 }
  });
  const sock = getSock();
  sock.sendMessage("120363423231838223@g.us", {
    image: {
      url: "./lazy.png",
    },
  });
  res.status(200).json({});
});

app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
