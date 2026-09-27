const STORAGE_KEY = "digiprojekt";
const SCENE_W = 938;
const SCENE_H = 1024;
const GROUND_Y = 205;
// Extra grass on each side of the design frame, so houses can sit further from the river.
const SCENE_PAD_X = 110;

// House and sign positions within the 938x1024 design frame; negative x or x past 938 sits in the side padding.
// growFrom is the point (relative to the house) that stays fixed when the house is enlarged.
const SLOTS = [
  { x: -50, y: 410, signX: 20, signY: 87, growFrom: "50px 0" },
  { x: 700, y: 248, signX: 17, signY: 83, growFrom: "40px 0" },
  { x: -50, y: 744, signX: 17, signY: 85, growFrom: "50px 0" },
  { x: 850, y: 574, signX: 19, signY: 83, growFrom: "0 0" },
];

const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);

function formatDate(iso) {
  const [, mm, dd] = iso.split("-");
  return `${dd}.${mm}`;
}

// A board is one whole planner: four houses, a diary and the boat. The sidebar lists every board.
function newBoard(name) {
  const now = Date.now();
  return {
    id: uid(),
    name,
    created: now,
    updated: now,
    projects: SLOTS.map(() => ({
      id: uid(),
      name: "Example",
      tasks: [{ id: uid(), date: today(), text: "example text", done: false }],
    })),
    diary: [{ id: uid(), date: today(), text: "example text" }],
  };
}

const isBoard = (b) => b && Array.isArray(b.projects) && Array.isArray(b.diary);

function loadStore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.boards) && saved.boards.some(isBoard)) {
      saved.boards = saved.boards.filter(isBoard);
      if (!saved.boards.some((b) => b.id === saved.activeId)) saved.activeId = saved.boards[0].id;
      return saved;
    }
    // Data saved before the sidebar existed becomes the first board.
    if (isBoard(saved)) {
      const now = Date.now();
      const board = { id: uid(), name: "My project", created: now, updated: now, ...saved };
      return { activeId: board.id, boards: [board] };
    }
  } catch {
    // Corrupt storage falls through to a fresh store.
  }
  const board = newBoard("My project");
  return { activeId: board.id, boards: [board] };
}

const store = loadStore();
let state = store.boards.find((b) => b.id === store.activeId);

const persist = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
function save() {
  state.updated = Date.now();
  persist();
  renderBoards();
}

const byDate = (a, b) => a.date.localeCompare(b.date);

/* ---------- Scene scaling ---------- */

const sceneWrap = document.getElementById("scene-wrap");
const scene = document.getElementById("scene");

// Fit the whole scene, resting on the bottom edge; leftover space continues the sky and grass.
function fitScene() {
  const { width, height } = sceneWrap.getBoundingClientRect();
  const viewW = SCENE_W + SCENE_PAD_X * 2;
  const scale = Math.min(width / viewW, height / SCENE_H);
  const left = (width - viewW * scale) / 2 + SCENE_PAD_X * scale;
  const top = height - SCENE_H * scale;
  scene.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;

  const horizon = top + GROUND_Y * scale;
  const edge = Math.max(1, scale);
  sceneWrap.style.background = `linear-gradient(var(--sky) ${horizon - edge}px, var(--grass-edge) ${horizon - edge}px, var(--grass-edge) ${horizon + edge}px, var(--grass) ${horizon + edge}px)`;
}

new ResizeObserver(fitScene).observe(sceneWrap);
fitScene();

/* ---------- Boat ---------- */

// River centerline in scene coordinates, split at each bend where a house sits.
const RIVER_SEGMENTS = [
  "M300 180 C330 240 520 250 531.5 349",
  "C540.5 450.5 270.5 418.5 270 504.5",
  "C269 591 707 571 712.5 677",
  "C718.5 782.5 161.5 764.5 312 841",
  // Final stretch to the castle gate, sailed only once every task is done.
  "C462 917 520 930 560 975",
];
// How many river segments lead from the start to the bend beside each slot's house.
const DOCK_SEGMENTS = [2, 1, 4, 3];
const BOAT_ANCHOR = { x: 66, y: 125 };
const BOAT_START_Y = 232;

const SVG_NS = "http://www.w3.org/2000/svg";
const routeSvg = document.getElementById("boat-route");
const boat = document.getElementById("boat");

function makePath(d) {
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  routeSvg.append(path);
  return path;
}

const route = makePath(RIVER_SEGMENTS.join(" "));
const routeLength = route.getTotalLength();
const dockLengths = DOCK_SEGMENTS.map((n) => {
  const prefix = makePath(RIVER_SEGMENTS.slice(0, n).join(" "));
  const length = prefix.getTotalLength();
  prefix.remove();
  return length;
});

// The river starts above the horizon; the boat's journey begins where it first touches the water.
let boatStart = 0;
while (route.getPointAtLength(boatStart).y < BOAT_START_Y) boatStart += 1;

let boatAt = boatStart;
let boatFrame = 0;

function placeBoat(length) {
  const p = route.getPointAtLength(length);
  const ahead = route.getPointAtLength(Math.min(length + 1, routeLength));
  const behind = route.getPointAtLength(Math.max(length - 1, 0));
  const facing = ahead.x < behind.x ? -1 : 1;
  boat.style.transform = `translate(${p.x - BOAT_ANCHOR.x}px, ${p.y - BOAT_ANCHOR.y}px) scaleX(${facing})`;
}

function boatTarget() {
  const allTasks = state.projects.flatMap((p) => p.tasks);
  if (allTasks.length && allTasks.every((t) => t.done)) return routeLength;

  const i = state.projects.findIndex((p) => p.id === state.boat?.projectId);
  if (i < 0) return boatStart;
  const { tasks } = state.projects[i];
  if (!tasks.length) return boatStart;
  const done = tasks.filter((t) => t.done).length;
  return boatStart + ((dockLengths[i] - boatStart) * done) / tasks.length;
}

// Sails toward the given project's house, as far as that project's share of finished tasks.
function sailBoat(projectId = state.boat?.projectId) {
  state.boat = { projectId };
  save();

  const from = boatAt;
  const to = boatTarget();
  cancelAnimationFrame(boatFrame);
  if (from === to || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    boatAt = to;
    placeBoat(to);
    return;
  }

  const duration = Math.min(3000, 600 + Math.abs(to - from) * 2);
  const start = performance.now();
  const step = (now) => {
    const t = Math.min((now - start) / duration, 1);
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    boatAt = from + (to - from) * eased;
    placeBoat(boatAt);
    if (t < 1) boatFrame = requestAnimationFrame(step);
  };
  boatFrame = requestAnimationFrame(step);
}

boatAt = boatTarget();
placeBoat(boatAt);

/* ---------- Houses ---------- */

const projectsEl = document.getElementById("projects");
const houseTemplate = document.getElementById("house-template");

function nextTask(project) {
  return [...project.tasks].sort(byDate).find((t) => !t.done);
}

function renderProjects() {
  projectsEl.replaceChildren(
    ...state.projects.map((project, i) => {
      const slot = SLOTS[i];
      const el = houseTemplate.content.firstElementChild.cloneNode(true);
      el.style.left = `${slot.x}px`;
      el.style.top = `${slot.y}px`;
      el.style.setProperty("--grow-from", slot.growFrom);

      const house = el.querySelector(".house");
      house.setAttribute("aria-label", `Open project ${project.name}`);
      house.addEventListener("click", () => openProject(project.id));
      el.querySelector(".house__name").textContent = project.name;

      const sign = el.querySelector(".sign");
      sign.style.setProperty("--sign-x", `${slot.signX}px`);
      sign.style.setProperty("--sign-y", `${slot.signY}px`);

      const task = nextTask(project);
      const text = el.querySelector(".sign__text");
      const checkbox = el.querySelector(".sign__check input");
      if (task) {
        text.textContent = `${formatDate(task.date)}: ${task.text}`;
        text.title = text.textContent;
        checkbox.setAttribute("aria-label", `Mark "${task.text}" done`);
        checkbox.addEventListener("change", () => {
          task.done = true;
          save();
          renderProjects();
          sailBoat(project.id);
        });
      } else {
        text.textContent = project.tasks.length ? "all done!" : "no tasks yet";
        checkbox.checked = project.tasks.length > 0;
        checkbox.disabled = true;
      }
      return el;
    })
  );
}

/* ---------- Project modal ---------- */

const modal = document.getElementById("modal");
const modalName = document.getElementById("modal-name");
const modalTasks = document.getElementById("modal-tasks");
const taskForm = document.getElementById("task-form");
let openProjectId = null;

const currentProject = () => state.projects.find((p) => p.id === openProjectId);

function openProject(id) {
  openProjectId = id;
  const project = currentProject();
  modalName.value = project.name;
  taskForm.date.value = today();
  renderTasks();
  modal.hidden = false;
  taskForm.text.focus();
}

function closeProject() {
  modal.hidden = true;
  openProjectId = null;
  renderProjects();
}

function renderTasks() {
  const project = currentProject();
  if (!project.tasks.length) {
    const empty = document.createElement("li");
    empty.className = "modal__empty";
    empty.textContent = "No tasks yet. Add one below.";
    modalTasks.replaceChildren(empty);
    return;
  }

  modalTasks.replaceChildren(
    ...[...project.tasks].sort(byDate).map((task) => {
      const li = document.createElement("li");
      li.className = "modal__task";
      li.classList.toggle("is-done", task.done);

      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = task.done;
      check.setAttribute("aria-label", `Done: ${task.text}`);
      check.addEventListener("change", () => {
        task.done = check.checked;
        save();
        renderTasks();
        sailBoat(project.id);
      });

      const date = document.createElement("span");
      date.className = "modal__task-date";
      date.textContent = formatDate(task.date);

      const text = document.createElement("span");
      text.className = "modal__task-text";
      text.textContent = task.text;

      const del = document.createElement("button");
      del.type = "button";
      del.className = "modal__delete";
      del.textContent = "\u00d7";
      del.setAttribute("aria-label", `Delete ${task.text}`);
      del.addEventListener("click", () => {
        project.tasks = project.tasks.filter((t) => t.id !== task.id);
        save();
        renderTasks();
        sailBoat();
      });

      li.append(check, date, text, del);
      return li;
    })
  );
}

modalName.addEventListener("input", () => {
  currentProject().name = modalName.value.trim() || "Untitled";
  save();
});

taskForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = taskForm.text.value.trim();
  if (!text) return;
  currentProject().tasks.push({ id: uid(), date: taskForm.date.value, text, done: false });
  save();
  taskForm.text.value = "";
  renderTasks();
  sailBoat();
});

modal.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeProject));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.hidden) closeProject();
});

/* ---------- Diary ---------- */

const diaryList = document.getElementById("diary-list");
const diaryForm = document.getElementById("diary-form");

function renderDiary() {
  diaryList.replaceChildren(
    ...[...state.diary].sort(byDate).map((entry) => {
      const li = document.createElement("li");
      li.className = "diary__entry";

      const text = document.createElement("span");
      text.className = "diary__entry-text";
      text.textContent = `${formatDate(entry.date)}:${entry.text}`;

      const del = document.createElement("button");
      del.type = "button";
      del.className = "diary__delete";
      del.textContent = "\u00d7";
      del.setAttribute("aria-label", `Delete entry ${entry.text}`);
      del.addEventListener("click", () => {
        state.diary = state.diary.filter((d) => d.id !== entry.id);
        save();
        renderDiary();
      });

      li.append(text, del);
      return li;
    })
  );
}

diaryForm.date.value = today();
diaryForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = diaryForm.text.value.trim();
  if (!text) return;
  state.diary.push({ id: uid(), date: diaryForm.date.value, text });
  save();
  diaryForm.text.value = "";
  renderDiary();
});

/* ---------- Sidebar (board history) ---------- */

const app = document.querySelector(".app");
const boardList = document.getElementById("board-list");
const sidebarToggle = document.getElementById("sidebar-toggle");
let renamingId = null;

const DAY = 24 * 60 * 60 * 1000;

function groupLabel(time) {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  if (time >= startOfToday) return "Today";
  if (time >= startOfToday - DAY) return "Yesterday";
  if (time >= startOfToday - 7 * DAY) return "Previous 7 days";
  if (time >= startOfToday - 30 * DAY) return "Previous 30 days";
  return "Older";
}

function boardProgress(board) {
  const tasks = board.projects.flatMap((p) => p.tasks);
  if (!tasks.length) return "no tasks yet";
  return `${tasks.filter((t) => t.done).length}/${tasks.length} tasks done`;
}

function renderBoards() {
  const groups = new Map();
  for (const board of [...store.boards].sort((a, b) => b.updated - a.updated)) {
    const label = groupLabel(board.updated);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(board);
  }

  boardList.replaceChildren(
    ...[...groups].map(([label, boards]) => {
      const section = document.createElement("section");
      const heading = document.createElement("h3");
      heading.className = "sidebar__group";
      heading.textContent = label;
      const ul = document.createElement("ul");
      ul.className = "sidebar__boards";
      ul.append(...boards.map(boardItem));
      section.append(heading, ul);
      return section;
    })
  );
}

function boardItem(board) {
  const li = document.createElement("li");
  li.className = "board";
  li.classList.toggle("is-active", board.id === state.id);

  if (board.id === renamingId) {
    const input = document.createElement("input");
    input.className = "board__rename-input";
    input.value = board.name;
    input.maxLength = 40;
    input.setAttribute("aria-label", "Project name");
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      renamingId = null;
      if (commit) board.name = input.value.trim() || "Untitled";
      persist();
      renderBoards();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish(true);
      if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
    li.append(input);
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
    return li;
  }

  const open = document.createElement("button");
  open.type = "button";
  open.className = "board__open";
  if (board.id === state.id) open.setAttribute("aria-current", "true");
  open.addEventListener("click", () => switchBoard(board.id));
  open.addEventListener("dblclick", () => startRename(board.id));

  const name = document.createElement("span");
  name.className = "board__name";
  name.textContent = board.name;
  const meta = document.createElement("span");
  meta.className = "board__meta";
  meta.textContent = boardProgress(board);
  open.append(name, meta);

  const rename = document.createElement("button");
  rename.type = "button";
  rename.className = "board__action";
  rename.textContent = "\u270e";
  rename.setAttribute("aria-label", `Rename ${board.name}`);
  rename.addEventListener("click", () => startRename(board.id));

  const del = document.createElement("button");
  del.type = "button";
  del.className = "board__action";
  del.textContent = "\u00d7";
  del.setAttribute("aria-label", `Delete ${board.name}`);
  del.addEventListener("click", () => deleteBoard(board.id));

  li.append(open, rename, del);
  return li;
}

function startRename(id) {
  renamingId = id;
  renderBoards();
}

function showBoard() {
  store.activeId = state.id;
  persist();
  cancelAnimationFrame(boatFrame);
  boatAt = boatTarget();
  placeBoat(boatAt);
  renderProjects();
  renderDiary();
  renderBoards();
}

function switchBoard(id) {
  if (id === state.id) return;
  state = store.boards.find((b) => b.id === id);
  showBoard();
}

function deleteBoard(id) {
  const board = store.boards.find((b) => b.id === id);
  if (!confirm(`Delete "${board.name}" and all its tasks?`)) return;
  store.boards = store.boards.filter((b) => b.id !== id);
  if (!store.boards.length) store.boards.push(newBoard("My project"));
  if (id === state.id) state = [...store.boards].sort((a, b) => b.updated - a.updated)[0];
  showBoard();
}

document.getElementById("new-board").addEventListener("click", () => {
  const board = newBoard(`Project ${store.boards.length + 1}`);
  store.boards.push(board);
  state = board;
  renamingId = board.id;
  if (store.sidebarCollapsed) setCollapsed(false);
  showBoard();
});

function setCollapsed(collapsed) {
  store.sidebarCollapsed = collapsed;
  app.classList.toggle("is-sidebar-collapsed", collapsed);
  sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  sidebarToggle.setAttribute("aria-label", collapsed ? "Show project list" : "Hide project list");
  persist();
}

sidebarToggle.addEventListener("click", () => setCollapsed(!store.sidebarCollapsed));
setCollapsed(Boolean(store.sidebarCollapsed));

renderProjects();
renderDiary();
renderBoards();
