// public/script.js
const socket = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host);
const wsStatus = document.getElementById('wsStatus');

let tasks = [];
let items, groups, timeline;
const colors = {};
function getColor(key){ if(!colors[key]) colors[key]=`hsl(${Math.floor(Math.random()*360)},65%,78%)`; return colors[key]; }

// UI elements
const addBtn = document.getElementById('addTask');
const contentInput = document.getElementById('taskContent');
const commessaInput = document.getElementById('taskCommessa');
const activityInput = document.getElementById('taskActivity');
const filterSelect = document.getElementById('filterCommessa');

socket.addEventListener('open', ()=> { wsStatus.textContent = 'connesso'; wsStatus.style.color='green'; });
socket.addEventListener('close', ()=> { wsStatus.textContent = 'disconnesso'; wsStatus.style.color='red'; });
socket.addEventListener('error', ()=> { wsStatus.textContent = 'errore'; wsStatus.style.color='orange'; });

// Receives init / update
socket.addEventListener('message', (ev) => {
  try {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'init') {
      tasks = msg.tasks || [];
      buildOrRefreshTimeline();
    } else if (msg.type === 'update') {
      tasks = msg.tasks || [];
      smartRefreshTimeline();
    }
  } catch (e) { console.error('WS parse error', e); }
});

// Build or refresh timeline
function buildOrRefreshTimeline(){
  const container = document.getElementById('timeline');

  // derive groups from tasks' commessa
  const commesse = [...new Set((tasks || []).map(t => t.group).filter(Boolean))];
  groups = new vis.DataSet(commesse.map(c => ({ id: c, content: c })));

  items = new vis.DataSet((tasks || []).map(t => normalizeItem(t)));

  const options = {
    editable: true,
    stack: true,
    margin: { item: 10, axis: 5 },
    stackSubgroups: true
  };

  if (!timeline) {
    timeline = new vis.Timeline(container, items, groups, options);

    // events to capture changes (add / move / updateTime / remove)
    timeline.on('add', (props, callback) => {
      // props.item might be id; item already in dataset if built via UI
      // use callback to confirm add
      syncAddFromDataset(props, callback);
    });

    timeline.on('move', (props, callback) => {
      // item moved (group/start changed)
      syncUpdateFromDataset(props, callback);
    });

    timeline.on('updateTime', (props, callback) => {
      syncUpdateFromDataset(props, callback);
    });

    timeline.on('remove', (props, callback) => {
      // props.items contains id(s)
      if (props && props.items) {
        props.items.forEach(id => {
          sendRemove(id);
        });
      }
      if (callback) callback(props.items);
    });

    // fallback
    timeline.on('change', () => { sendFullReplace(); });
  } else {
    timeline.setGroups(groups);
    items.clear();
    items.add((tasks || []).map(t => normalizeItem(t)));
  }

  populateFilter();
}

// Normalize for vis
function normalizeItem(t){
  return {
    id: String(t.id),
    content: t.content || "",
    start: t.start,
    end: t.end,
    group: t.group || "SENZA_COMMESSA",
    subgroup: t.subgroup || t.activity || null,
    style: t.style || `background-color:${getColor(t.group || t.subgroup || "default")}`
  };
}

// Smart refresh: add/update/remove minimal operations
function smartRefreshTimeline(){
  if(!items) { buildOrRefreshTimeline(); return; }

  // add or update
  tasks.forEach(t => {
    const existing = items.get(String(t.id));
    const norm = normalizeItem(t);
    if(existing) {
      // quick compare
      const keys = ['content','start','end','group','subgroup','style'];
      let changed=false;
      for(const k of keys) if(String(existing[k]||'') !== String(norm[k]||'')){ changed=true; break; }
      if(changed) items.update(norm);
    } else {
      items.add(norm);
    }
  });

  // remove deleted
  const currentIds = tasks.map(t => String(t.id));
  items.get().forEach(i => {
    if(!currentIds.includes(String(i.id))) items.remove(String(i.id));
  });

  // update groups list if needed
  const commesse = [...new Set(items.get().map(i=>i.group).filter(Boolean))];
  groups.clear();
  commesse.forEach(c => groups.add({ id:c, content:c }));
  timeline.setGroups(groups);

  populateFilter();
}

// UI helpers: populate commessa filter select (commesse dinamiche)
function populateFilter(){
  const commesse = [...new Set(items.get().map(i=>i.group).filter(Boolean))];
  const sel = filterSelect;
  const prev = sel.value || 'tutte';
  sel.innerHTML = '<option value="tutte">Tutte</option>';
  commesse.forEach(c => {
    const op = document.createElement('option'); op.value=c; op.textContent=c; sel.appendChild(op);
  });
  sel.value = prev && (commesse.includes(prev) || prev === 'tutte') ? prev : 'tutte';
  applyFilter();
}

function applyFilter(){
  const f = filterSelect.value;
  items.get().forEach(it => {
    const visible = (f === 'tutte') ? true : (it.group === f);
    items.update({ id: it.id, visible });
  });
}
filterSelect.addEventListener('change', applyFilter);

// Send functions: add/update/remove
function sendAdd(task){
  try { socket.send(JSON.stringify({ type: 'add', task })); } catch(e){}
}
function sendUpdate(task){
  try { socket.send(JSON.stringify({ type: 'update', task })); } catch(e){}
}
function sendRemove(id){
  try { socket.send(JSON.stringify({ type: 'remove', id })); } catch(e){}
}
function sendFullReplace(){
  try { socket.send(JSON.stringify({ type: 'replace', tasks: items.get() })); } catch(e){}
}

// When user adds with UI button
addBtn.addEventListener('click', ()=> {
  const content = contentInput.value.trim();
  const commessa = commessaInput.value.trim() || 'SENZA_COMMESSA';
  const activity = activityInput.value.trim() || null;
  if(!content) return alert('Inserisci il titolo del task');

  const id = 'task-' + Date.now() + '-' + Math.floor(Math.random()*1000);
  const now = new Date();
  const end = new Date(now.getTime() + 60*60*1000);
  const task = {
    id,
    content,
    start: now.toISOString(),
    end: end.toISOString(),
    group: commessa,
    subgroup: activity,
    style: `background-color:${getColor(commessa)}`
  };

  // add to local dataset and notify server
  if(!items) { tasks = [task]; buildOrRefreshTimeline(); sendAdd(task); }
  else { items.add(normalizeItem(task)); sendAdd(task); }

  // clear inputs
  contentInput.value = ''; activityInput.value = '';
  // if commessa new, keep it in input (so user can add many tasks to same commessa)
  populateFilter();
});

// Sync helpers used by vis callbacks
function syncAddFromDataset(props, callback){
  // props.item is id OR object depending on version; find new items that are not in tasks
  const localItemIds = new Set(tasks.map(t => String(t.id)));
  const all = items.get();
  for(const it of all){
    if(!localItemIds.has(String(it.id))){
      // send add
      const t = {
        id: String(it.id),
        content: it.content,
        start: (it.start instanceof Date)?it.start.toISOString():it.start,
        end: (it.end instanceof Date)?it.end.toISOString():it.end,
        group: it.group,
        subgroup: it.subgroup,
        style: it.style
      };
      sendAdd(t);
      // also update local tasks array to include it (avoid re-adding)
      tasks.push(t);
    }
  }
  if(callback) callback(props.item);
}

function syncUpdateFromDataset(props, callback){
  const id = props.item;
  const it = items.get(id);
  if(!it) { if(callback) callback(id); return; }
  const t = {
    id: String(it.id),
    content: it.content,
    start: (it.start instanceof Date)?it.start.toISOString():it.start,
    end: (it.end instanceof Date)?it.end.toISOString():it.end,
    group: it.group,
    subgroup: it.subgroup,
    style: it.style
  };
  sendUpdate(t);

  // update local tasks array optimistically
  const idx = tasks.findIndex(x=>String(x.id)===String(t.id));
  if(idx>=0) tasks[idx] = t; else tasks.push(t);

  if(callback) callback(id);
}
