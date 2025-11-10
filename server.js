// server.js
import express from "express";
import { WebSocketServer } from "ws";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "tasks.json");

const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// load tasks safe
let tasks = [];
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    tasks = raw ? JSON.parse(raw) : [];
  }
} catch (err) {
  console.error("Failed reading tasks.json:", err);
  tasks = [];
}

// simple API to get tasks (optional)
app.get("/api/tasks", (req, res) => {
  res.json(tasks);
});

const server = app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
});

const wss = new WebSocketServer({ server });

function safeWriteTasks() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(tasks, null, 2));
  } catch (err) {
    console.error("Error saving tasks.json:", err);
  }
}

function broadcast(obj, except = null) {
  const msg = JSON.stringify(obj);
  wss.clients.forEach((c) => {
    try {
      if (c.readyState === c.OPEN && c !== except) c.send(msg);
    } catch (e) {
      // ignore send errors for single clients
    }
  });
}

wss.on("connection", (ws, req) => {
  console.log("🟢 WS connected:", req.socket.remoteAddress || req.headers['x-forwarded-for'] || "unknown");

  // send initial state
  try { ws.send(JSON.stringify({ type: "init", tasks })); } catch(e){}

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      console.warn("Malformed WS message, ignoring");
      return;
    }

    // handle messages: add / update / remove / ping
    if (msg.type === "add" && msg.task) {
      // ensure id
      const t = { ...msg.task };
      if (!t.id) t.id = "task-" + Date.now() + "-" + Math.floor(Math.random()*1000);
      tasks.push(t);
      safeWriteTasks();
      broadcast({ type: "update", tasks }, ws);
      console.log("Added task", t.id);
      return;
    }

    if (msg.type === "update" && msg.task) {
      const t = msg.task;
      const idx = tasks.findIndex(x => String(x.id) === String(t.id));
      if (idx >= 0) {
        tasks[idx] = { ...tasks[idx], ...t };
      } else {
        tasks.push(t);
      }
      safeWriteTasks();
      broadcast({ type: "update", tasks }, ws);
      console.log("Updated task", t.id);
      return;
    }

    if (msg.type === "remove" && msg.id) {
      const id = String(msg.id);
      tasks = tasks.filter(x => String(x.id) !== id);
      safeWriteTasks();
      broadcast({ type: "update", tasks }, ws);
      console.log("Removed task", id);
      return;
    }

    if (msg.type === "replace" && Array.isArray(msg.tasks)) {
      // full replace (careful) - used rarely
      tasks = msg.tasks;
      safeWriteTasks();
      broadcast({ type: "update", tasks }, ws);
      console.log("Replaced tasks (full)");
      return;
    }

    if (msg.type === "ping") {
      try { ws.send(JSON.stringify({ type: "pong" })); } catch(e){}
    }
  });

  ws.on("close", () => {
    console.log("🔴 WS disconnected");
  });

  ws.on("error", (err) => {
    console.warn("WS error:", err && err.message);
  });
});
