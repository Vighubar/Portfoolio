const STORAGE_KEY = "digiprojekt";
const STAGE_W = 1440;
const STAGE_H = 1024;

// House and sign positions taken from the design frame (px within the 1440x1024 stage).
const SLOTS = [
  { x: 19, y: 410, signX: 20, signY: 87 },
  { x: 635, y: 248, signX: 17, signY: 83 },
  { x: 19, y: 744, signX: 17, signY: 85 },
  { x: 771, y: 574, signX: 19, signY: 83 },
];

const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);

function formatDate(iso) {
  const [, mm, dd] = iso.split("-");
  return `${dd}.${mm}`;
}

function defaultState() {
  return {
    projects: SLOTS.map(() => ({
      id: uid(),
      name: "Example",
      tasks: [{ id: uid(), date: today(), text: "example text", done: false }],
    })),
    diary: [{ id: uid(), date: today(), text: "example text" }],
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.projects) && Array.isArray(saved.diary)) return saved;
  } catch {
    // Corrupt storage falls through to a fresh state.
  }
  return defaultState();
}

let state = loadState();
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

const byDate = (a, b) => a.date.localeCompare(b.date);

/* ---------- Stage scaling ---------- */

const stage = document.getElementById("stage");

function fitStage() {
  const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
  const left = (window.innerWidth - STAGE_W * scale) / 2;
  const top = (window.innerHeight - STAGE_H * scale) / 2;
  stage.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
}

window.addEventListener("resize", fitStage);
fitStage();

/* ---------- Boat ---------- */

// River centerline in stage coordinates, split at each bend where a house sits.
const RIVER_SEGMENTS = [
  "M392 237.5 C470 255 528 300 531.5 349",
  "C540.5 450.5 270.5 418.5 270 504.5",
  "C269 591 707 571 712.5 677",
  "C718.5 782.5 161.5 764.5 312 841",
];
// How many river segments lead from the start to the bend beside each slot's house.
const DOCK_SEGMENTS = [2, 1, 4, 3];
const BOAT_ANCHOR = { x: 66, y: 125 };

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
  const i = state.projects.findIndex((p) => p.id === state.boat?.projectId);
  if (i < 0) return 0;
  const { tasks } = state.projects[i];
  if (!tasks.length) return 0;
  const done = tasks.filter((t) => t.done).length;
  return (dockLengths[i] * done) / tasks.length;
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

renderProjects();
renderDiary();
