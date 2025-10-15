import express from "express";
import { WebSocketServer } from "ws";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const TASKS_FILE = path.join(__dirname, "tasks.json");

// Carica tasks iniziali
let tasks = [];
if (fs.existsSync(TASKS_FILE)) {
  try {
    tasks = JSON.parse(fs.readFileSync(TASKS_FILE, "utf-8"));
  } catch (e) {
    console.error("Errore nel leggere tasks.json", e);
  }
}

// EXPRESS: serve i file statici (frontend)
const app = express();
app.use(express.static(path.join(__dirname, "public")));

// REST: API per scaricare i task iniziali
app.get("/api/tasks", (req, res) => {
  res.json(tasks);
});

// HTTP server
const server = app.listen(PORT, () =>
  console.log(`🚀 Server attivo su http://localhost:${PORT}`)
);

// WEBSOCKET: comunicazione realtime
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("🟢 Nuovo client connesso");

  // Invia tasks iniziali al nuovo client
  ws.send(JSON.stringify({ type: "init", tasks }));

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.type === "add" || data.type === "update") {
      const existing = tasks.find((t) => t.id === data.task.id);
      if (existing) {
        Object.assign(existing, data.task);
      } else {
        tasks.push(data.task);
      }
      broadcast(JSON.stringify({ type: "sync", tasks }));
      saveTasks();
    }

    if (data.type === "remove") {
      tasks = tasks.filter((t) => t.id !== data.id);
      broadcast(JSON.stringify({ type: "sync", tasks }));
      saveTasks();
    }
  });

  ws.on("close", () => {
    console.log("🔴 Client disconnesso");
  });
});

function broadcast(msg) {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });
}

function saveTasks() {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}
