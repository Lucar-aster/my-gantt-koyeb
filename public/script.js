// 🌐 Connessione WebSocket al server Koyeb
const socket = new WebSocket(`wss://${window.location.host}`);

let tasks = [];
let items;
let groups;
let timeline;

// 🔌 Gestione messaggi dal server
socket.addEventListener("message", (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "init") {
    tasks = data.tasks;
    renderTimeline();
  }

  if (data.type === "update") {
    tasks = data.tasks;
    refreshTimeline();
  }
});

// 🧠 Funzione per costruire la timeline
function renderTimeline() {
  const container = document.getElementById("timeline");

  // Crea dataset gruppi (commesse)
  groups = new vis.DataSet([
    { id: 'COMMESSA_A', content: 'Commessa A' },
    { id: 'COMMESSA_B', content: 'Commessa B' },
    { id: 'COMMESSA_C', content: 'Commessa C' }
  ]);

  // Crea dataset tasks
  items = new vis.DataSet(tasks);

  const options = {
    stack: true,
    editable: true,
    margin: { item: 10, axis: 5 }
  };

  timeline = new vis.Timeline(container, items, groups, options);

  // Eventi di modifica → sincronizzazione con server
  timeline.on("add", syncWithServer);
  timeline.on("update", syncWithServer);
  timeline.on("remove", syncWithServer);
  timeline.on("change", syncWithServer);
}

// 🌀 Aggiorna timeline quando arrivano modifiche dagli altri
function refreshTimeline() {
  if (!items) return;
  items.clear();
  items.add(tasks);
}

// ➕ Aggiungi nuovo task
document.getElementById("addTask").addEventListener("click", () => {
  const id = Date.now().toString();
  const start = new Date();
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  // 🔸 Default: assegna alla Commessa A (puoi cambiare con menu a tendina)
  const newTask = {
    id,
    content: `Nuovo Task ${id}`,
    start,
    end,
    group: 'COMMESSA_A'
  };

  items.add(newTask);
  syncWithServer();
});

// 📡 Invia stato attuale al server
function syncWithServer() {
  const currentTasks = items.get();
  socket.send(JSON.stringify({ type: "update", tasks: currentTasks }));
}
