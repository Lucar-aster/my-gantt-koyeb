const socket = new WebSocket(`wss://${window.location.host}`);
let tasks = [];
let timeline;
let items;

// Ricezione messaggi dal server
socket.addEventListener("message", (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "init") {
    tasks = data.tasks;
    renderTimeline();
  }

  if (data.type === "update") {
    tasks = data.tasks;
    updateTimeline();
  }
});

// Render iniziale timeline
function renderTimeline() {
  const container = document.getElementById("timeline");
  items = new vis.DataSet(tasks);
  timeline = new vis.Timeline(container, items, { editable: true });

  timeline.on("change", () => syncWithServer());
  timeline.on("add", () => syncWithServer());
  timeline.on("update", () => syncWithServer());
  timeline.on("remove", () => syncWithServer());
}

// Aggiornamento quando arrivano modifiche da altri
function updateTimeline() {
  if (!items) return;
  items.clear();
  items.add(tasks);
}

// Aggiungi nuovo task
document.getElementById("addTask").addEventListener("click", () => {
  const id = Date.now().toString();
  const start = new Date();
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const newTask = { id, content: "Nuovo Task", start, end };
  items.add(newTask);
  syncWithServer();
});

// Sincronizza con server
function syncWithServer() {
  const currentTasks = items.get();
  socket.send(JSON.stringify({ type: "update", tasks: currentTasks }));
}
