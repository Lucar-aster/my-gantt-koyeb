// public/script.js
// WebSocket -> usa lo stesso host (Koyeb fornisce HTTPS/WSS)
const socket = new WebSocket(`wss://${window.location.host}`);

let tasks = [];    // array sincronizzato col server
let items;         // vis.DataSet degli item
let groups;        // vis.DataSet dei gruppi (commesse)
let timeline;      // vis.Timeline

// ---------- Helper colori per commesse e attività (sottogruppi) ----------
const colors = {};
function getColor(key) {
  if (!colors[key]) colors[key] = `hsl(${Math.floor(Math.random() * 360)},65%,75%)`;
  return colors[key];
}

// ---------- Ricezione messaggi dal server ----------
socket.addEventListener("message", (ev) => {
  try {
    const msg = JSON.parse(ev.data);
    if (msg.type === "init") {
      tasks = msg.tasks || [];
      buildOrRefreshTimeline();
    } else if (msg.type === "update") {
      tasks = msg.tasks || [];
      smartRefreshTimeline();
    }
  } catch (e) {
    console.error("Errore parsing WS:", e);
  }
});

// ---------- Costruzione iniziale della timeline (o ricostruzione) ----------
function buildOrRefreshTimeline() {
  const container = document.getElementById("timeline");

  // crea gruppi dinamicamente dalle commesse presenti
  const commesse = [...new Set((tasks || []).map(t => t.group).filter(Boolean))];
  groups = new vis.DataSet(commesse.map(c => ({ id: c, content: c })));

  // crea items (mantieni subgroup se presente)
  items = new vis.DataSet(tasks.map(t => normalizeItem(t)));

  const options = {
    editable: true,
    stack: true,
    margin: { item: 10, axis: 5 },
    stackSubgroups: true  // permette gli stacking dei sottogruppi
  };

  // se timeline non esiste, creala; altrimenti setta items/groups
  if (!timeline) {
    timeline = new vis.Timeline(container, items, groups, options);

    // eventi per sincronizzazione in tempo reale
    timeline.on("add", (props, callback) => {
      // props.item è l'id temporaneo o item, ma useremo il dataset
      // Chiama callback per confermare l'add (vis richiede callback se presente)
      syncWithServer();
      if (callback) callback(props.item);
    });

    // move: quando si trascina un item in un'altra posizione o gruppo
    timeline.on("move", (props, callback) => {
      // props.item === id dell'item spostato
      syncWithServer();
      if (callback) callback(props.item);
    });

    // updateTime: quando si ridimensiona (change durata)
    timeline.on("updateTime", (props, callback) => {
      syncWithServer();
      if (callback) callback(props.item);
    });

    // remove: rimozione
    timeline.on("remove", (props, callback) => {
      syncWithServer();
      if (callback) callback(props.item);
    });

    // change fallback (alcune versioni emettono change)
    timeline.on("change", () => {
      syncWithServer();
    });
  } else {
    // Aggiorna i dataset senza ricreare il componente (evita flicker)
    timeline.setGroups(groups);
    // items è già un vis.DataSet; ricrealo in modo sicuro:
    items.clear();
    items.add(tasks.map(t => normalizeItem(t)));
  }
}

// ---------- Normalizza un oggetto task affinché vis lo accetti ----------
function normalizeItem(t) {
  // vis può accettare Date o string ISO; manteniamo string ISO menù
  const item = {
    id: t.id,
    content: t.content || "",
    start: t.start,
    end: t.end,
    group: t.group || "SENZA_COMMESSA",
    subgroup: t.subgroup || t.activity || null,
    style: t.style || `background-color:${getColor(t.group || t.subgroup || "default")}`
  };
  return item;
}

// ---------- Aggiornamento intelligente (solo differenze) ----------
function smartRefreshTimeline() {
  if (!items) return;

  // 1) Aggiungi o aggiorna
  tasks.forEach((t) => {
    const existing = items.get(t.id);
    const normalized = normalizeItem(t);
    if (existing) {
      // confronta rapidamente per evitare update inutili
      const keys = ["content", "start", "end", "group", "subgroup", "style"];
      let changed = false;
      for (const k of keys) {
        if ((existing[k] || "") !== (normalized[k] || "")) { changed = true; break; }
      }
      if (changed) items.update(normalized);
    } else {
      items.add(normalized);
    }
  });

  // 2) Rimuovi quelli cancellati
  const currentIds = tasks.map(t => t.id);
  items.get().forEach(it => {
    if (!currentIds.includes(it.id)) items.remove(it.id);
  });

  // 3) Aggiorna i gruppi dinamicamente (commesse nuove)
  const commesse = [...new Set(items.get().map(i => i.group).filter(Boolean))];
  groups.clear();
  commesse.forEach(c => groups.add({ id: c, content: c }));
  timeline.setGroups(groups);
}

// ---------- usata dopo init se timeline non esiste ancora ----------
function buildOrRefreshTimeline() {
  // (la funzione è già definita sopra) -> chiamata in ricezione init
}

// ---------- Sincronizzazione col server ----------
function syncWithServer() {
  if (!items || socket.readyState !== WebSocket.OPEN) return;
  const currentTasks = items.get().map(it => {
    // mappa in struttura serializzabile
    return {
      id: String(it.id),
      content: it.content,
      start: (it.start instanceof Date) ? it.start.toISOString() : it.start,
      end: (it.end instanceof Date) ? it.end.toISOString() : it.end,
      group: it.group,
      subgroup: it.subgroup,
      style: it.style
    };
  });
  try {
    socket.send(JSON.stringify({ type: "update", tasks: currentTasks }));
  } catch (e) {
    console.error("Errore invio WS:", e);
  }
}

// ---------- Aggiunta task via UI (esempio) ----------
// Se hai un controllo UI, legalo qui. Esempio di pulsante "addTask":
const addBtn = document.getElementById("addTask");
if (addBtn) {
  addBtn.addEventListener("click", () => {
    const id = "task-" + Date.now();
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);
    const newTask = {
      id,
      content: `Nuovo task ${id}`,
      start: now.toISOString(),
      end: end.toISOString(),
      group: "COMMESSA_A",
      subgroup: "Attività 1",
      style: `background-color:${getColor("COMMESSA_A")}`
    };
    // se items non esiste ancora, crea timeline con questo task
    if (!items) {
      tasks = [newTask];
      buildOrRefreshTimeline();
      syncWithServer();
    } else {
      items.add(normalizeItem(newTask));
      syncWithServer();
    }
  });
}

// ---------- utility: quando la connessione WS si apre potresti loggare ----------
socket.addEventListener("open", () => console.log("WS connesso"));
socket.addEventListener("close", () => console.log("WS chiuso"));
socket.addEventListener("error", (e) => console.error("WS errore:", e));
