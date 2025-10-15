import express from "express";
import { WebSocketServer } from "ws";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static("public"));

// JSON file path
const DATA_FILE = "./tasks.json";

// Carica i task esistenti
let tasks = [];
if (fs.existsSync(DATA_FILE)) {
  try {
    tasks = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch (e) {
    console.error("Errore nel leggere tasks.json:", e);
  }
}

// Avvia il server HTTP
const server = app.listen(PORT, () => {
  console.log(`🚀 Server attivo su http://0.0.0.0:${PORT}`);
});

// Avvia WebSocket
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("🧍 Nuovo client connesso");

  // Invia i task correnti al nuovo client
  ws.send(JSON.stringify({ type: "init", tasks }));

  // Riceve modifiche dai client
  ws.on("message", (message) => {
    const data = JSON.parse(message);

    if (data.type === "update") {
      tasks = data.tasks;

      // Salva su file JSON
      fs.writeFile(DATA_FILE, JSON.stringify(tasks, null, 2), (err) => {
        if (err) console.error("Errore nel salvataggio:", err);
      });

      // Invia a tutti gli altri client
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === ws.OPEN) {
          client.send(JSON.stringify({ type: "update", tasks }));
        }
      });
    }
  });
});
