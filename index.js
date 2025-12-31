const express = require("express");
const cors = require("cors");
const { initWhatsApp, getSock } = require("./whatsapp");
const redis = require("redis");
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

initWhatsApp().then(() => console.log("WhatsApp initialized"));

const redisClient = redis.createClient({
  url: process.env.REDIS_URL || "redis://172.16.2.13:32769",
});

redisClient.on("error", (err) => console.error("Redis Client Error", err));

redisClient.connect().then(() => {
  console.log("Connected to Redis");
});

app.get("/send", async (req, res) => {
  try {
    if (redisClient.rPopCount("alertQueue", 1) === 0) {
      return res.json({ success: true, message: "No alerts in queue" });
    } else {
      const alert = await redisClient.lPop("alertQueue");
      const { to, message } = JSON.parse(alert);

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
        return res.json({ success: true, id: sends.key.id });
      } else {
        console.log("Message failed to send:");
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
    redisClient.rPush("alertQueue", JSON.stringify({ to, message }));
    res.json({ success: true, message: "Alert queued" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
