const STORAGE_KEY = "digiprojekt";
const SCENE_W = 938;
const SCENE_H = 1024;
const GROUND_Y = 205;
// Extra grass on each side of the design frame, so houses can sit further from the river.
const SCENE_PAD_X = 110;

// Each extra scenery section repeats the river below the last one, mirrored left-right every other time.
const TILE_H = 819.965;
const MIRROR_X = 962;
const HOUSE_W = 148;
const HOUSE_SCALE = 1.3;
const SIGN_W = 109;

// Plots for the four houses of one section; negative x or x past 938 sits in the side padding.
// (gx, gy) is the point (relative to the house) that stays fixed when the house is enlarged.
const SLOTS = [
  { x: -50, y: 410, signX: 20, signY: 87, gx: 50, gy: 0 },
  { x: 700, y: 248, signX: 17, signY: 83, gx: 40, gy: 0 },
  { x: -50, y: 744, signX: 17, signY: 85, gx: 50, gy: 0 },
  { x: 850, y: 574, signX: 19, signY: 83, gx: 0, gy: 0 },
];
// The order the river passes the plots of a section.
const RIVER_ORDER = [1, 0, 3, 2];

const BUSHES = [[423, 422], [33, 192], [130, 915]];
const TREES = [[915, 174], [285, 569], [664, 760]];

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
    tiles: 1,
    projects: SLOTS.map((_, slot) => ({
      id: uid(),
      name: "Example",
      slot,
      tasks: [{ id: uid(), date: today(), text: "example text", done: false }],
    })),
    diary: [{ id: uid(), date: today(), text: "example text" }],
  };
}

const isBoard = (b) => b && Array.isArray(b.projects) && Array.isArray(b.diary);

// Boards saved before houses could be added have no plots or sections yet.
function upgradeBoard(board) {
  board.projects.forEach((p, i) => {
    if (!Number.isInteger(p.slot)) p.slot = i;
  });
  const lastSlot = Math.max(-1, ...board.projects.map((p) => p.slot));
  board.tiles = Math.max(1, board.tiles || 1, Math.floor(lastSlot / 4) + 1);
  return board;
}

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
store.boards.forEach(upgradeBoard);
let state = store.boards.find((b) => b.id === store.activeId);

// True while showing someone else's project from a view-only share link; nothing is saved then.
let readOnly = false;

const persist = () => {
  if (!readOnly) localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
};
function save() {
  if (readOnly) return;
  state.updated = Date.now();
  persist();
  renderBoards();
}

const byDate = (a, b) => a.date.localeCompare(b.date);

/* ---------- Scene scaling ---------- */

const sceneWrap = document.getElementById("scene-wrap");
const scene = document.getElementById("scene");

const sceneSizer = document.getElementById("scene-sizer");
const sceneHeight = () => SCENE_H + TILE_H * (state.tiles - 1);

// Fit the first section to the screen, resting on the bottom edge; extra sections scroll below it.
function fitScene() {
  const width = sceneWrap.clientWidth;
  const height = sceneWrap.clientHeight;
  const viewW = SCENE_W + SCENE_PAD_X * 2;
  const scale = Math.min(width / viewW, height / SCENE_H);
  const left = (width - viewW * scale) / 2 + SCENE_PAD_X * scale;
  const top = height - SCENE_H * scale;
  scene.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
  sceneSizer.style.height = `${top + sceneHeight() * scale}px`;

  const horizon = top + GROUND_Y * scale;
  const edge = Math.max(1, scale);
  sceneWrap.style.backgroundImage = `linear-gradient(var(--sky) ${horizon - edge}px, var(--grass-edge) ${horizon - edge}px, var(--grass-edge) ${horizon + edge}px, var(--grass) ${horizon + edge}px)`;
}

new ResizeObserver(fitScene).observe(sceneWrap);

/* ---------- Scenery sections ---------- */

// Points below are in the river's own coordinates (river.svg's frame); section k sits TILE_H * k lower.
const toScene = (k, [x, y]) => [k % 2 ? MIRROR_X - 165 - x : x + 165, y + 203 + TILE_H * k];
const mirrorX = (k, x, w) => (k % 2 ? MIRROR_X - x - w : x);

// river.svg's shape. Later sections reshape the top to join the bottom of the section above.
// Only the first section outlines its top (the horizon); no section outlines its bottom, so sections join cleanly.
const RIVER_TOPS = [
  {
    left: "C296.426 45.9432 12.9841 1 12.9841 1",
    edge: "H209.134",
    bankStart: "M12.9841 1H209.134",
    right: "C209.134 1 419.319 42.947 427.535 146.316",
  },
  {
    left: "C296.426 45.9432 17.215 70 17.215 0",
    edge: "H204.465",
    bankStart: "M204.465 0",
    right: "C160 30 419.319 42.947 427.535 146.316",
  },
];
const RIVER_RIGHT =
  "C435.751 249.686 209.134 235.703 209.134 309.61" +
  "C209.134 383.516 605.542 338.573 614.785 474.402C624.027 610.23 170.434 577.771 238.214 638.694" +
  "C305.994 699.617 614.785 789.004 614.785 819.965";
// The first control point leads into the next section's bank, so the joins stay smooth.
const RIVER_LEFT =
  "C383 790 290.229 730.798 56.2139 638.694C-177.801 546.59 482.991 549.806 481.279 474.402" +
  "C479.568 398.997 -0.366345 393.004 1.00292 294.629C2.37219 196.253 316.281 246.689 306.353 146.316";

function riverShape(k) {
  const top = RIVER_TOPS[k ? 1 : 0];
  return {
    fill: `M306.353 146.316${top.left}${top.edge}${top.right}${RIVER_RIGHT}H427.535${RIVER_LEFT}Z`,
    banks: `${top.bankStart}${top.right}${RIVER_RIGHT}M427.535 819.965${RIVER_LEFT}${top.left}`,
  };
}

// River centerline as cubic curves, split at each bend where a house sits, then out the bottom.
const FIRST_START = [135, -23];
const FIRST_BEND = [[165, 37], [355, 47], [366.5, 146]];
const CONTINUED_BEND = [[110.84, 70], [355, 47], [366.5, 146]];
const CENTER_CURVES = [
  [[375.5, 247.5], [105.5, 215.5], [105, 301.5]],
  [[104, 388], [542, 368], [547.5, 474]],
  [[553.5, 579.5], [-3.5, 561.5], [147, 638]],
  [[297.5, 714.5], [521.15, 760], [521.15, TILE_H]],
];
const CURVES_PER_TILE = 5;
// How many curves lead from a section's start to the bend beside each of its plots.
const DOCK_CURVES = [2, 1, 4, 3];

const SVG_NS = "http://www.w3.org/2000/svg";
const riverSvg = document.getElementById("river");
const moreBushes = document.getElementById("more-bushes");
const moreTrees = document.getElementById("more-trees");

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function decoration(src, w, h, x, y) {
  const img = document.createElement("img");
  Object.assign(img, { className: "asset", src, alt: "", width: w, height: h });
  img.style.left = `${x}px`;
  img.style.top = `${y}px`;
  return img;
}

function renderScenery() {
  const fills = [];
  const banks = [];
  const bushes = [];
  const trees = [];
  for (let k = 0; k < state.tiles; k++) {
    const y = 203 + TILE_H * k;
    const transform = k % 2 ? `translate(${MIRROR_X - 165} ${y}) scale(-1 1)` : `translate(165 ${y})`;
    const shape = riverShape(k);
    fills.push(svgEl("path", { d: shape.fill, transform, fill: "#8AAEE0" }));
    banks.push(svgEl("path", { d: shape.banks, transform, fill: "none", stroke: "#4A6FA5", "stroke-width": 2, "stroke-linecap": "round" }));
    if (!k) continue;

    for (const [x, by] of BUSHES) bushes.push(decoration("bush.svg", 139, 112, mirrorX(k, x, 139), by + TILE_H * k));
    for (const [x, ty] of TREES) trees.push(decoration("tree.svg", 85, 147, mirrorX(k, x, 85), ty + TILE_H * k));
  }
  riverSvg.setAttribute("height", sceneHeight());
  riverSvg.replaceChildren(...fills, ...banks);
  moreBushes.replaceChildren(...bushes);
  moreTrees.replaceChildren(...trees);
  scene.style.height = `${sceneHeight()}px`;
  buildRoute();
  fitScene();
}

/* ---------- Boat ---------- */

const BOAT_ANCHOR = { x: 66, y: 125 };
const BOAT_START_Y = 232;

const routeSvg = document.getElementById("boat-route");
const boat = document.getElementById("boat");
const route = routeSvg.appendChild(svgEl("path", {}));
let routeLength = 0;
let dockLengths = [];
let boatStart = 0;

function curveString(k, curve) {
  return "C" + curve.map((p) => toScene(k, p).join(" ")).join(" ");
}

function buildRoute() {
  const curves = [];
  for (let k = 0; k < state.tiles; k++) {
    curves.push(curveString(k, k ? CONTINUED_BEND : FIRST_BEND), ...CENTER_CURVES.map((c) => curveString(k, c)));
  }
  const start = "M" + toScene(0, FIRST_START).join(" ");
  route.setAttribute("d", start + curves.join(""));
  routeLength = route.getTotalLength();

  const prefix = routeSvg.appendChild(svgEl("path", {}));
  dockLengths = Array.from({ length: state.tiles * 4 }, (_, slot) => {
    const n = Math.floor(slot / 4) * CURVES_PER_TILE + DOCK_CURVES[slot % 4];
    prefix.setAttribute("d", start + curves.slice(0, n).join(""));
    return prefix.getTotalLength();
  });
  prefix.remove();

  // The river starts above the horizon; the boat's journey begins where it first touches the water.
  boatStart = 0;
  while (route.getPointAtLength(boatStart).y < BOAT_START_Y) boatStart += 1;
}

let boatAt = 0;
let boatFrame = 0;

function placeBoat(length) {
  const p = route.getPointAtLength(length);
  const ahead = route.getPointAtLength(Math.min(length + 1, routeLength));
  const behind = route.getPointAtLength(Math.max(length - 1, 0));
  const facing = ahead.x < behind.x ? -1 : 1;
  boat.style.transform = `translate(${p.x - BOAT_ANCHOR.x}px, ${p.y - BOAT_ANCHOR.y}px) scaleX(${facing})`;
}

function boatTarget() {
  const project = state.projects.find((p) => p.id === state.boat?.projectId);
  if (!project?.tasks.length) return boatStart;
  const done = project.tasks.filter((t) => t.done).length;
  return boatStart + ((dockLengths[project.slot] - boatStart) * done) / project.tasks.length;
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

renderScenery();
boatAt = boatTarget();
placeBoat(boatAt);

/* ---------- Houses ---------- */

const projectsEl = document.getElementById("projects");
const houseTemplate = document.getElementById("house-template");

function nextTask(project) {
  return [...project.tasks].sort(byDate).find((t) => !t.done);
}

// Where a plot's house and sign go; plots in mirrored sections are flipped to the other bank.
function plotPosition(index) {
  const k = Math.floor(index / 4);
  const base = SLOTS[index % 4];
  const y = base.y + TILE_H * k;
  if (k % 2 === 0) return { ...base, y };

  const grown = HOUSE_W * HOUSE_SCALE;
  const left = mirrorX(k, base.x - (HOUSE_SCALE - 1) * base.gx, grown);
  const gx = HOUSE_W - base.gx;
  return { x: left + (HOUSE_SCALE - 1) * gx, y, gx, gy: base.gy, signX: HOUSE_W - base.signX - SIGN_W, signY: base.signY };
}

// The first empty plot going down the river, adding a new scenery section when all are taken.
function freePlot() {
  const taken = new Set(state.projects.map((p) => p.slot));
  for (let k = 0; ; k++) {
    for (const i of RIVER_ORDER) if (!taken.has(k * 4 + i)) return k * 4 + i;
  }
}

function renderProjects() {
  projectsEl.replaceChildren(
    ...state.projects.map((project) => {
      const slot = plotPosition(project.slot);
      const el = houseTemplate.content.firstElementChild.cloneNode(true);
      el.dataset.id = project.id;
      el.style.left = `${slot.x}px`;
      el.style.top = `${slot.y}px`;
      el.style.setProperty("--grow-from", `${slot.gx}px ${slot.gy}px`);

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
      if (readOnly) checkbox.disabled = true;
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

function openProject(id, { naming = false } = {}) {
  openProjectId = id;
  const project = currentProject();
  modalName.value = project.name;
  taskForm.date.value = today();
  renderTasks();
  modal.hidden = false;
  modalName.readOnly = readOnly;
  if (readOnly) modal.querySelector(".modal__close").focus();
  else if (naming) modalName.select();
  else taskForm.text.focus();
}

document.getElementById("add-house").addEventListener("click", () => {
  const slot = freePlot();
  const tiles = Math.max(state.tiles, Math.floor(slot / 4) + 1);
  const project = { id: uid(), name: "New house", slot, tasks: [] };
  state.projects.push(project);
  if (tiles !== state.tiles) {
    state.tiles = tiles;
    renderScenery();
  }
  save();
  renderProjects();
  projectsEl.querySelector(`[data-id="${project.id}"]`).scrollIntoView({ block: "center", behavior: "smooth" });
  openProject(project.id, { naming: true });
});

// The house's plot empties, but the scenery keeps its size.
document.getElementById("remove-house").addEventListener("click", () => {
  const project = currentProject();
  if (!confirm(`Delete the house "${project.name}" and its tasks?`)) return;
  state.projects = state.projects.filter((p) => p.id !== project.id);
  save();
  closeProject();
  sailBoat();
});

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
      check.disabled = readOnly;
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
  if (e.key !== "Escape") return;
  if (!modal.hidden) closeProject();
  if (!shareModal.hidden) closeShare();
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
  displayBoard();
}

function displayBoard() {
  cancelAnimationFrame(boatFrame);
  renderScenery();
  sceneWrap.scrollTop = 0;
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

/* ---------- Sharing ---------- */

// A share link carries a compressed snapshot of the board in its #hash, so no server is needed.
const shareModal = document.getElementById("share-modal");
const shareUrl = document.getElementById("share-url");
const shareCopy = document.getElementById("share-copy");
const shareModes = shareModal.querySelectorAll('input[name="share-mode"]');
const toast = document.getElementById("toast");

async function packBoard(board) {
  const { name, tiles, projects, diary, boat } = board;
  const json = JSON.stringify({ name, tiles, projects, diary, boat });
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function unpackBoard(text) {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return JSON.parse(await new Response(stream).text());
}

const shareMode = () => [...shareModes].find((r) => r.checked).value;

async function updateShareLink() {
  const mode = shareMode();
  shareUrl.value = `${location.origin}${location.pathname}#${mode}=${await packBoard(state)}`;
  shareCopy.textContent = "copy link";
}

function openShare() {
  document.getElementById("share-title").textContent = `Share "${state.name}"`;
  shareModal.hidden = false;
  updateShareLink();
  shareCopy.focus();
}

function closeShare() {
  shareModal.hidden = true;
}

document.getElementById("share-open").addEventListener("click", openShare);
shareModal.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeShare));
shareModes.forEach((r) => r.addEventListener("change", updateShareLink));
shareUrl.addEventListener("focus", () => shareUrl.select());
shareCopy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    shareCopy.textContent = "copied!";
  } catch {
    shareUrl.select();
    shareCopy.textContent = "press Ctrl+C";
  }
});

let toastTimer = 0;
function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 4000);
}

async function openSharedLink() {
  const match = location.hash.match(/^#(view|edit)=(.+)$/);
  if (!match) return;
  const [, mode, data] = match;

  let board = null;
  try {
    board = await unpackBoard(data);
  } catch {
    // A cut-off or edited link can't be decoded.
  }
  if (!isBoard(board)) {
    history.replaceState(null, "", location.pathname);
    showToast("This share link is broken or incomplete.");
    return;
  }

  const now = Date.now();
  state = upgradeBoard({ ...board, id: uid(), name: String(board.name || "Shared project"), created: now, updated: now });

  if (mode === "edit") {
    store.boards.push(state);
    history.replaceState(null, "", location.pathname);
    showBoard();
    showToast(`"${state.name}" was added to your projects. Your changes stay on your copy.`);
    return;
  }

  readOnly = true;
  document.body.classList.add("is-readonly");
  document.getElementById("shared-name").textContent = state.name;
  document.getElementById("shared-exit").href = location.pathname;
  document.getElementById("shared-bar").hidden = false;
  displayBoard();
}

// Pasting a share link into a tab that already shows the planner only changes the hash.
addEventListener("hashchange", () => {
  if (/^#(view|edit)=/.test(location.hash)) location.reload();
});

renderProjects();
renderDiary();
renderBoards();
openSharedLink();
