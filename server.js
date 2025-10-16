// server.js
import express from 'express';
import { WebSocketServer } from 'ws';
import { google } from 'googleapis';
import http from 'http';

// ⚙️ Configurazioni base
const PORT = process.env.PORT || 8000; // Koyeb usa 8000
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// 🧠 Variabile globale con i task correnti
let tasks = [];

// 🌐 Middleware per servire i file statici della cartella public
app.use(express.static('public'));

// 📡 WebSocket multiutente
wss.on('connection', (ws) => {
  console.log('✅ Nuovo client connesso');

  // Invia i task attuali appena il client si collega
  ws.send(JSON.stringify({ type: 'init', tasks }));

  // Ricevi aggiornamenti dai client
  ws.on('message', async (message) => {
    const data = JSON.parse(message);

    if (data.type === 'update') {
      tasks = data.tasks;

      // ✅ Salva immediatamente su Google Drive
      try {
        await writeTasksToDrive(tasks);
      } catch (err) {
        console.error('❌ Errore nel salvataggio su Drive:', err);
      }

      // 🔄 Invia a tutti gli altri client
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify({ type: 'update', tasks }));
        }
      });
    }
  });

  ws.on('close', () => {
    console.log('❌ Client disconnesso');
  });
});

// 🚀 Avvio server
server.listen(PORT, async () => {
  console.log(`🚀 Server attivo su http://0.0.0.0:${PORT}`);

  // 🟡 Leggi i task iniziali da Google Drive
  try {
    tasks = await readTasksFromDrive();
    console.log(`📄 Tasks caricati da Google Drive (${tasks.length} record)`);
  } catch (err) {
    console.error('⚠️ Nessun file trovato o errore nella lettura:', err.message);
    tasks = [];
  }
});


// ==========================
// 🔐 GOOGLE DRIVE INTEGRAZIONE
// ==========================
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
const fileId = process.env.GOOGLE_FILE_ID;

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/drive.file'],
});

const drive = google.drive({ version: 'v3', auth });

// 📥 Legge tasks.json da Google Drive
async function readTasksFromDrive() {
  const res = await drive.files.get({ fileId, alt: 'media' });
  return res.data;
}

// 📤 Scrive tasks.json su Google Drive
async function writeTasksToDrive(tasks) {
  await drive.files.update({
    fileId,
    media: {
      mimeType: 'application/json',
      body: JSON.stringify(tasks, null, 2),
    },
  });
}
