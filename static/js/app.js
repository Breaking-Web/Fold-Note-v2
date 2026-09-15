"use strict";

/* ==========================================================================
   Tillstånd
   ========================================================================== */

let notes = [];
let current = null;      // hela den öppna anteckningen
let dirty = false;       // finns osparade ändringar?
let saveTimer = null;
let saving = false;

const $ = (sel) => document.querySelector(sel);

const el = {
  noteList: $("#noteList"),
  listEmpty: $("#listEmpty"),
  sidebar: $("#sidebar"),
  scrim: $("#scrim"),
  menuBtn: $("#menuBtn"),
  titles: $("#titles"),
  title: $("#title"),
  tags: $("#tags"),
  status: $("#status"),
  deleteNote: $("#deleteNote"),
  empty: $("#empty"),
  editor: $("#editor"),
  segments: $("#segments"),
  addSegment: $("#addSegment"),
  newNote: $("#newNote"),
  emptyNew: $("#emptyNew"),
  themeBtn: $("#themeBtn"),
  themeColorMeta: $("#themeColorMeta"),
  importBtn: $("#importBtn"),
  importFile: $("#importFile"),
};

/* ==========================================================================
   API
   ========================================================================== */

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    body = null;
  }
  if (!res.ok) {
    throw new Error((body && body.error) || `Servern svarade ${res.status}.`);
  }
  return body;
}

/* ==========================================================================
   Status
   ========================================================================== */

let statusTimer = null;

function setStatus(text, kind = "") {
  clearTimeout(statusTimer);
  el.status.textContent = text;
  el.status.className = "status" + (kind ? " " + kind : "");
  if (kind === "saved") {
    statusTimer = setTimeout(() => {
      el.status.textContent = "";
      el.status.className = "status";
    }, 1600);
  }
}

/* ==========================================================================
   Autospara
   ========================================================================== */

// Räknare som stegas vid varje ändring. Gör att vi kan se om användaren
// hann skriva mer medan ett sparanrop var på väg.
let revision = 0;

function markDirty() {
  dirty = true;
  revision++;
  setStatus("Sparar …");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 800);
}

async function save() {
  clearTimeout(saveTimer);
  if (!current || !dirty || saving) return;
  saving = true;
  const noteId = current.id;
  const revAtSend = revision;
  try {
    const saved = await api("/api/notes/" + noteId, {
      method: "PUT",
      body: JSON.stringify(current),
    });
    updateListEntry(saved);
    if (current && current.id === noteId && revision === revAtSend) {
      // Inget hann ändras medan anropet pågick — då stämmer serverns
      // id:n mot det vi har, och anteckningen är i synk.
      applyIds(current, saved);
      current.updated_at = saved.updated_at;
      dirty = false;
      setStatus("Sparat", "saved");
    } else {
      // Användaren skrev vidare. Spara om direkt.
      saving = false;
      return save();
    }
  } catch (err) {
    setStatus("Kunde inte spara", "error");
    console.error(err);
  } finally {
    saving = false;
  }
}

function applyIds(target, saved) {
  saved.segments.forEach((s, i) => {
    const t = target.segments[i];
    if (!t) return;
    t.id = s.id;
    s.versions.forEach((v, j) => {
      if (t.versions[j]) t.versions[j].id = v.id;
    });
  });
}

// Sista utvägen: spara innan fliken stängs.
window.addEventListener("beforeunload", (e) => {
  if (!dirty) return;
  save();
  e.preventDefault();
  e.returnValue = "";
});

// Spara när man växlar bort från appen på telefonen.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && dirty) save();
});

/* ==========================================================================
   Anteckningslistan
   ========================================================================== */

function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const now = new Date();
  const time = d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return "Idag " + time;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Igår " + time;
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" }) + " " + time;
}

function renderList() {
  el.noteList.textContent = "";
  el.listEmpty.hidden = notes.length > 0;

  for (const note of notes) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "note" + (current && current.id === note.id ? " active" : "");

    const title = document.createElement("span");
    title.className = "note-title";
    title.textContent = note.title || "Namnlös anteckning";

    const meta = document.createElement("span");
    meta.className = "note-meta";
    meta.textContent = [formatWhen(note.updated_at), note.tags].filter(Boolean).join(" · ");

    btn.append(title, meta);
    btn.addEventListener("click", () => openNote(note.id));
    el.noteList.appendChild(btn);
  }
}

function updateListEntry(saved) {
  const entry = notes.find((n) => n.id === saved.id);
  if (!entry) return;
  entry.title = saved.title;
  entry.tags = saved.tags;
  entry.updated_at = saved.updated_at;
  notes.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  renderList();
}

async function refreshList() {
  notes = await api("/api/notes");
  renderList();
}

/* ==========================================================================
   Öppna / stänga en anteckning
   ========================================================================== */

async function openNote(id) {
  if (current && current.id === id) {
    closeDrawer();
    return;
  }
  if (dirty) await save();     // byt aldrig anteckning med osparat innehåll
  try {
    current = await api("/api/notes/" + id);
    dirty = false;
    renderNote();
    renderList();
    closeDrawer();
  } catch (err) {
    setStatus("Kunde inte öppna", "error");
    console.error(err);
  }
}

function renderNote() {
  const open = Boolean(current);
  el.empty.hidden = open;
  el.editor.hidden = !open;
  el.titles.hidden = !open;
  el.deleteNote.hidden = !open;
  if (!open) return;

  el.title.value = current.title || "";
  el.tags.value = current.tags || "";
  renderSegments();
}

/* ==========================================================================
   Stycken och formuleringar
   ========================================================================== */

function autosize(ta) {
  ta.style.height = "auto";
  ta.style.height = ta.scrollHeight + "px";
}

function renderSegments() {
  el.segments.textContent = "";
  current.segments.forEach((seg) => el.segments.appendChild(segmentEl(seg)));
  // Höjderna måste sättas efter att elementen finns i DOM:en.
  requestAnimationFrame(() => {
    el.segments.querySelectorAll(".ta").forEach(autosize);
  });
}

function segmentEl(seg) {
  const node = $("#segmentTpl").content.cloneNode(true);
  const article = node.querySelector(".segment");
  // Numret läses ut vid rendering, inte lagras — annars blir det fel
  // så fort ett stycke tas bort.
  const index = current.segments.indexOf(seg);
  article.querySelector(".seg-number").textContent = "Stycke " + (index + 1);

  const original = article.querySelector(".original");
  original.value = seg.original || "";
  original.addEventListener("input", () => {
    seg.original = original.value;
    autosize(original);
    markDirty();
  });

  article.querySelector(".seg-remove").addEventListener("click", () => {
    if (!confirm("Ta bort stycket och alla dess formuleringar?")) return;
    // Sök upp positionen just nu — inte den som gällde vid rendering.
    const at = current.segments.indexOf(seg);
    if (at === -1) return;
    current.segments.splice(at, 1);
    if (current.segments.length === 0) current.segments.push(blankSegment());
    renderSegments();
    markDirty();
  });

  const versions = article.querySelector(".versions");
  seg.versions.forEach((v) => versions.appendChild(versionEl(seg, v)));

  article.querySelector(".add-version").addEventListener("click", () => {
    const v = { id: null, label: "Formulering " + (seg.versions.length + 1), text: seg.original || "" };
    seg.versions.push(v);
    const added = versionEl(seg, v);
    versions.appendChild(added);
    added.querySelectorAll(".ta").forEach(autosize);
    added.querySelector(".version-text").focus();
    markDirty();
  });

  return article;
}

function versionEl(seg, version) {
  const node = $("#versionTpl").content.cloneNode(true);
  const wrap = node.querySelector(".version");

  const label = wrap.querySelector(".version-label");
  label.value = version.label || "";
  label.addEventListener("input", () => {
    version.label = label.value;
    markDirty();
  });

  const text = wrap.querySelector(".version-text");
  text.value = version.text || "";
  text.addEventListener("input", () => {
    version.text = text.value;
    autosize(text);
    markDirty();
  });

  wrap.querySelector(".version-remove").addEventListener("click", () => {
    const at = seg.versions.indexOf(version);
    if (at === -1) return;
    seg.versions.splice(at, 1);
    wrap.remove();
    markDirty();
  });

  return wrap;
}

function blankSegment() {
  return { id: null, original: "", versions: [] };
}

/* ==========================================================================
   Tema — ljust / mörkt / auto (auto följer klockan, 19–07 är mörkt)
   ========================================================================== */

const THEME_KEY = "foldnote-theme";
const MODES = ["auto", "light", "dark"];
const LABELS = { auto: "Auto", light: "Ljust", dark: "Mörkt" };

function resolveTheme(mode) {
  if (mode !== "auto") return mode;
  const h = new Date().getHours();
  return h >= 19 || h < 7 ? "dark" : "light";
}

function applyTheme(mode) {
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeMode = mode;
  el.themeBtn.textContent = LABELS[mode];
  el.themeBtn.title = `Tema: ${LABELS[mode]}. Tryck för att byta.`;
  if (el.themeColorMeta) {
    el.themeColorMeta.setAttribute("content", resolved === "dark" ? "#14110D" : "#FAF8F5");
  }
}

function currentMode() {
  try {
    return localStorage.getItem(THEME_KEY) || "auto";
  } catch (_) {
    return "auto";
  }
}

function cycleTheme() {
  const next = MODES[(MODES.indexOf(currentMode()) + 1) % MODES.length];
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch (_) {}
  applyTheme(next);
}

// Auto ska byta av sig själv när klockan passerar gränsen.
setInterval(() => {
  if (currentMode() === "auto") applyTheme("auto");
}, 60000);

/* ==========================================================================
   Sidopanel på smal skärm
   ========================================================================== */

function openDrawer() {
  el.sidebar.classList.add("open");
  el.scrim.hidden = false;
}

function closeDrawer() {
  el.sidebar.classList.remove("open");
  el.scrim.hidden = true;
}

/* ==========================================================================
   Händelser
   ========================================================================== */

async function createNote() {
  if (dirty) await save();
  try {
    current = await api("/api/notes", {
      method: "POST",
      body: JSON.stringify({ title: "", tags: "" }),
    });
    dirty = false;
    await refreshList();
    renderNote();
    renderList();
    closeDrawer();
    el.title.focus();
  } catch (err) {
    setStatus("Kunde inte skapa", "error");
    console.error(err);
  }
}

el.newNote.addEventListener("click", createNote);
el.emptyNew.addEventListener("click", createNote);

el.title.addEventListener("input", () => {
  current.title = el.title.value;
  markDirty();
});

el.tags.addEventListener("input", () => {
  current.tags = el.tags.value;
  markDirty();
});

el.addSegment.addEventListener("click", () => {
  current.segments.push(blankSegment());
  renderSegments();
  markDirty();
  const all = el.segments.querySelectorAll(".original");
  if (all.length) all[all.length - 1].focus();
});

el.deleteNote.addEventListener("click", async () => {
  if (!current) return;
  if (!confirm("Ta bort hela anteckningen? Det går inte att ångra.")) return;
  const id = current.id;
  clearTimeout(saveTimer);
  dirty = false;
  current = null;
  renderNote();
  try {
    await api("/api/notes/" + id, { method: "DELETE" });
    await refreshList();
  } catch (err) {
    setStatus("Kunde inte ta bort", "error");
    console.error(err);
  }
});

el.menuBtn.addEventListener("click", () =>
  el.sidebar.classList.contains("open") ? closeDrawer() : openDrawer()
);
el.scrim.addEventListener("click", closeDrawer);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDrawer();
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    save();
  }
});

el.themeBtn.addEventListener("click", cycleTheme);

el.importBtn.addEventListener("click", () => el.importFile.click());

el.importFile.addEventListener("change", async () => {
  const file = el.importFile.files[0];
  if (!file) return;
  el.importFile.value = "";           // så att samma fil kan väljas igen
  try {
    const parsed = JSON.parse(await file.text());
    const result = await api("/api/import", {
      method: "POST",
      body: JSON.stringify(parsed),
    });
    await refreshList();
    setStatus(`La till ${result.added}`, "saved");
  } catch (err) {
    setStatus("Kunde inte importera", "error");
    alert("Filen gick inte att läsa som en FoldNote-export.");
    console.error(err);
  }
});

/* ==========================================================================
   Start
   ========================================================================== */

if ("serviceWorker" in navigator && window.isSecureContext) {
  // Registreras i roten så att den får scope över hela appen.
  // Över http mot datorns IP-adress hoppas den över — appen fungerar
  // ändå, bara utan offline-cache. Se README.
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

(async function init() {
  applyTheme(currentMode());
  renderNote();
  try {
    await refreshList();
  } catch (err) {
    setStatus("Ingen kontakt", "error");
    console.error(err);
  }
})();
