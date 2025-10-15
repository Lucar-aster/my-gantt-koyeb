const socket = new WebSocket(location.origin.replace(/^http/, "ws"));
const container = document.getElementById("timeline");
const items = new vis.DataSet([]);
const groups = new vis.DataSet([]);
const timeline = new vis.Timeline(container, items, {
  editable: { add: true, remove: true, updateTime: true },
  stack: true,
  groupOrder: "id",
  groups: groups
});

const colors = {};
function getColor(commessa) {
  if (!colors[commessa]) {
    colors[commessa] = `hsl(${Math.floor(Math.random() * 360)},70%,70%)`;
  }
  return colors[commessa];
}

function updateGroups() {
  const commesse = [...new Set(items.get().map((t) => t.group))];
  groups.clear();
  commesse.forEach((c) => groups.add({ id: c, content: c }));

  const select = document.getElementById("filterCommessa");
  const selected = select.value;
  select.innerHTML = `<option value="tutte">Tutte</option>`;
  commesse.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    select.appendChild(opt);
  });
  select.value = selected || "tutte";
  applyFilter();
}

function applyFilter() {
  const filter = document.getElementById("filterCommessa").value;
  const all = items.get();
  all.forEach((t) => {
    items.update({ ...t, visible: filter === "tutte" ? true : t.group === filter });
  });
}

document.getElementById("filterCommessa").addEventListener("change", applyFilter);

// Ricezione messaggi dal server
socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === "init" || data.type === "sync") {
    items.clear();
    items.add(data.tasks);
    updateGroups();
  }
};

// Aggiunta task
document.getElementById("addTask").addEventListener("click", () => {
  const content = document.getElementById("taskContent").value.trim();
  const commessa = document.getElementById("taskCommessa").value.trim();
  if (!content || !commessa) return alert("Inserisci nome task e commessa!");

  const id = "task-" + Date.now();
  const now = new Date();
  const end = new Date(now.getTime() + 60 * 60 * 1000);

  const task = {
    id,
    content,
    start: now.toISOString(),
    end: end.toISOString(),
    group: commessa,
    style: `background-color:${getColor(commessa)}`
  };

  items.add(task);
  socket.send(JSON.stringify({ type: "add", task }));
  updateGroups();

  document.getElementById("taskContent").value = "";
  document.getElementById("taskCommessa").value = "";
});

// Modifiche e cancellazioni
timeline.on("change", (e) => {
  e.items.forEach((id) => {
    const t = items.get(id);
    socket.send(JSON.stringify({ type: "update", task: t }));
  });
});

timeline.on("remove", (e) => {
  e.items.forEach((id) => {
    socket.send(JSON.stringify({ type: "remove", id }));
  });
});
