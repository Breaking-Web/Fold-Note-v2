"use strict";

/* =========================================================================
   Ikoner (delas mellan block som byggs dynamiskt)
   ========================================================================= */

const ICON_CHEVRON_LEFT =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
const ICON_CHEVRON_RIGHT =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
const ICON_PLUS =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>';
const ICON_TRASH =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>';
const ICON_CLOSE =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

/* =========================================================================
   API-hjälpare
   ========================================================================= */

async function apiCall(url, options) {
  const res = await fetch(url, options);
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  if (!res.ok) {
    const message = (data && data.error) || "Något gick fel mot servern.";
    throw new Error(message);
  }
  return data;
}

const API = {
  listNotes: () => apiCall("/api/notes"),
  createNote: () =>
    apiCall("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),
  getNote: (id) => apiCall(`/api/notes/${id}`),
  updateNoteTitle: (id, title) =>
    apiCall(`/api/notes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }),
  deleteNote: (id) => apiCall(`/api/notes/${id}`, { method: "DELETE" }),
  addBlock: (noteId) => apiCall(`/api/notes/${noteId}/blocks`, { method: "POST" }),
  deleteBlock: (blockId) => apiCall(`/api/blocks/${blockId}`, { method: "DELETE" }),
  updateBlockContent: (blockId, content) =>
    apiCall(`/api/blocks/${blockId}/content`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }),
  addVersion: (blockId) => apiCall(`/api/blocks/${blockId}/versions`, { method: "POST" }),
  setActiveVersion: (blockId, direction) =>
    apiCall(`/api/blocks/${blockId}/active-version`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction }),
    }),
  deleteVersion: (versionId) => apiCall(`/api/versions/${versionId}`, { method: "DELETE" }),
};

/* =========================================================================
   Tillstånd + DOM-referenser
   ========================================================================= */

const state = {
  notes: [],
  currentNote: null,
};

const els = {
  notesList: document.getElementById("notes-list"),
  emptyState: document.getElementById("empty-state"),
  appLayout: document.getElementById("app-layout"),
  detailPlaceholder: document.getElementById("detail-placeholder"),
  noteEditor: document.getElementById("note-editor"),
  noteTitleInput: document.getElementById("note-title-input"),
  blocksContainer: document.getElementById("blocks-container"),
  saveIndicator: document.getElementById("save-indicator"),
  backBtn: document.getElementById("back-btn"),
  deleteNoteBtn: document.getElementById("delete-note-btn"),
  addBlockBtn: document.getElementById("add-block-btn"),
  fabNewNote: document.getElementById("fab-new-note"),
  themeToggleBtn: document.getElementById("theme-toggle-btn"),
  installBtn: document.getElementById("install-btn"),
  themeColorMeta: document.getElementById("theme-color-meta"),
};

/* =========================================================================
   Hjälpfunktioner
   ========================================================================= */

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : str;
  return div.innerHTML;
}

function formatTimestamp(iso) {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });

  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `Idag ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Igår ${time}`;

  return `${d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" })} ${time}`;
}

function autosize(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = textarea.scrollHeight + "px";
}

let saveIndicatorTimer = null;

function showSaving() {
  clearTimeout(saveIndicatorTimer);
  els.saveIndicator.textContent = "Sparar …";
  els.saveIndicator.className = "save-indicator saving";
}

function showSaved() {
  els.saveIndicator.textContent = "Sparat";
  els.saveIndicator.className = "save-indicator saved";
  clearTimeout(saveIndicatorTimer);
  saveIndicatorTimer = setTimeout(() => {
    els.saveIndicator.textContent = "";
    els.saveIndicator.className = "save-indicator";
  }, 1400);
}

function showError(message) {
  clearTimeout(saveIndicatorTimer);
  els.saveIndicator.textContent = "Kunde inte spara";
  els.saveIndicator.className = "save-indicator error";
  if (message) console.error(message);
}

/* =========================================================================
   Rendering: anteckningslistan
   ========================================================================= */

async function loadNotes() {
  const notes = await API.listNotes();
  state.notes = notes;
  renderNotesList();
}

function renderNotesList() {
  els.notesList.innerHTML = "";
  els.emptyState.classList.toggle("hidden", state.notes.length > 0);

  for (const note of state.notes) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "note-list-item";
    if (state.currentNote && state.currentNote.id === note.id) {
      item.classList.add("active");
    }
    item.innerHTML = `
      <div class="note-list-item-top">
        <span class="note-list-item-title">${escapeHtml(note.title || "Namnlös anteckning")}</span>
        <span class="note-list-item-time">${formatTimestamp(note.updated_at)}</span>
      </div>
      <p class="note-list-item-preview">${escapeHtml(note.preview || "")}</p>
    `;
    item.addEventListener("click", () => openNote(note.id));
    els.notesList.appendChild(item);
  }
}

function updateNoteInListLocally() {
  const note = state.notes.find((n) => n.id === state.currentNote.id);
  if (!note) return;
  note.title = state.currentNote.title;
  note.updated_at = state.currentNote.updated_at;
  state.notes.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  renderNotesList();
}

function updateNotePreviewLocally() {
  const note = state.notes.find((n) => n.id === state.currentNote.id);
  if (!note) return;
  const firstBlock = state.currentNote.blocks[0];
  if (firstBlock) {
    const activeVersion = firstBlock.versions.find((v) => v.id === firstBlock.active_version_id);
    note.preview = (activeVersion ? activeVersion.content : "").slice(0, 160);
  }
  note.updated_at = state.currentNote.updated_at;
  state.notes.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  renderNotesList();
}

/* =========================================================================
   Rendering: anteckningseditorn
   ========================================================================= */

async function openNote(id) {
  try {
    const note = await API.getNote(id);
    state.currentNote = note;
    renderNotesList();
    renderEditor();
    els.appLayout.classList.add("show-detail");
  } catch (e) {
    showError(e.message);
  }
}

function closeDetail() {
  state.currentNote = null;
  els.appLayout.classList.remove("show-detail");
  renderNotesList();
}

function renderEditor() {
  const note = state.currentNote;
  if (!note) {
    els.detailPlaceholder.classList.remove("hidden");
    els.noteEditor.classList.add("hidden");
    return;
  }
  els.detailPlaceholder.classList.add("hidden");
  els.noteEditor.classList.remove("hidden");
  els.noteTitleInput.value = note.title;

  els.blocksContainer.innerHTML = "";
  note.blocks.forEach((block) => {
    els.blocksContainer.appendChild(renderBlock(block));
  });
}

function renderBlock(block) {
  const wrapper = document.createElement("div");
  wrapper.className = "block";
  wrapper.dataset.blockId = block.id;

  const activeVersion =
    block.versions.find((v) => v.id === block.active_version_id) || block.versions[0];
  const versionIndex = block.versions.findIndex((v) => v.id === activeVersion.id);
  const hasMultiple = block.versions.length > 1;

  const toolbar = document.createElement("div");
  toolbar.className = "block-toolbar";

  const versionSwitcher = document.createElement("div");
  versionSwitcher.className = "version-switcher" + (hasMultiple ? "" : " hidden");
  versionSwitcher.innerHTML = `
    <button type="button" class="chevron-btn" data-action="prev-version" aria-label="Föregående version">${ICON_CHEVRON_LEFT}</button>
    <span class="version-indicator">${versionIndex + 1}/${block.versions.length}</span>
    <button type="button" class="chevron-btn" data-action="next-version" aria-label="Nästa version">${ICON_CHEVRON_RIGHT}</button>
  `;

  const actions = document.createElement("div");
  actions.className = "block-actions";
  actions.innerHTML = `
    <button type="button" class="icon-btn small" data-action="add-version" title="Lägg till en alternativ version av det här stycket">
      ${ICON_PLUS}<span class="btn-label">Version</span>
    </button>
    ${
      hasMultiple
        ? `<button type="button" class="icon-btn small danger icon-only" data-action="delete-version" title="Ta bort den här versionen">${ICON_TRASH}</button>`
        : ""
    }
    <button type="button" class="icon-btn small danger icon-only" data-action="delete-block" title="Ta bort stycket">${ICON_CLOSE}</button>
  `;

  toolbar.appendChild(versionSwitcher);
  toolbar.appendChild(actions);

  const textarea = document.createElement("textarea");
  textarea.className = "block-content";
  textarea.placeholder = "Skriv något …";
  textarea.value = activeVersion.content;
  textarea.rows = 1;

  wrapper.appendChild(toolbar);
  wrapper.appendChild(textarea);

  requestAnimationFrame(() => autosize(textarea));

  textarea.addEventListener("input", () => {
    autosize(textarea);
    scheduleBlockSave(block.id, textarea.value);
  });

  toolbar.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "prev-version") switchVersion(block.id, "prev");
    if (action === "next-version") switchVersion(block.id, "next");
    if (action === "add-version") addVersionToBlock(block.id);
    if (action === "delete-version") deleteCurrentVersion(activeVersion.id);
    if (action === "delete-block") deleteBlockConfirm(block.id);
  });

  return wrapper;
}

/* =========================================================================
   Sparande (debounce)
   ========================================================================= */

const blockSaveTimers = {};
let titleSaveTimer = null;

function scheduleBlockSave(blockId, content) {
  const key = String(blockId);
  showSaving();
  clearTimeout(blockSaveTimers[key]);
  blockSaveTimers[key] = setTimeout(async () => {
    delete blockSaveTimers[key];
    try {
      await API.updateBlockContent(blockId, content);
      const block = state.currentNote.blocks.find((b) => String(b.id) === key);
      if (block) {
        const v = block.versions.find((v) => v.id === block.active_version_id);
        if (v) v.content = content;
      }
      state.currentNote.updated_at = new Date().toISOString();
      updateNotePreviewLocally();
      showSaved();
    } catch (e) {
      showError(e.message);
    }
  }, 700);
}

// Om ett stycke har en väntande (debounced) autosave när användaren gör
// något som ritar om editorn (byter version, lägger till en version,
// tar bort ett stycke osv), måste den väntande texten sparas FÖRST —
// annars kan omritningen skriva över det man precis skrev med den
// gamla, osparade texten.
async function flushPendingSave(blockId) {
  const key = String(blockId);
  const timer = blockSaveTimers[key];
  if (!timer) return;
  clearTimeout(timer);
  delete blockSaveTimers[key];
  const textarea = els.blocksContainer.querySelector(`.block[data-block-id="${key}"] .block-content`);
  if (!textarea) return;
  try {
    await API.updateBlockContent(key, textarea.value);
    const block = state.currentNote.blocks.find((b) => String(b.id) === key);
    if (block) {
      const v = block.versions.find((v) => v.id === block.active_version_id);
      if (v) v.content = textarea.value;
    }
  } catch (e) {
    showError(e.message);
  }
}

async function flushAllPendingSaves() {
  const keys = Object.keys(blockSaveTimers);
  for (const key of keys) {
    await flushPendingSave(key);
  }
}

/* =========================================================================
   Versionshantering
   ========================================================================= */

async function switchVersion(blockId, direction) {
  try {
    await flushPendingSave(blockId);
    const note = await API.setActiveVersion(blockId, direction);
    state.currentNote = note;
    renderEditor();
  } catch (e) {
    showError(e.message);
  }
}

async function addVersionToBlock(blockId) {
  try {
    showSaving();
    await flushPendingSave(blockId);
    const note = await API.addVersion(blockId);
    state.currentNote = note;
    renderEditor();
    showSaved();
  } catch (e) {
    showError(e.message);
  }
}

async function deleteCurrentVersion(versionId) {
  if (!confirm("Ta bort den här versionen av stycket? Går inte att ångra.")) return;
  try {
    const note = await API.deleteVersion(versionId);
    state.currentNote = note;
    renderEditor();
  } catch (e) {
    alert(e.message || "Kunde inte ta bort versionen.");
  }
}

/* =========================================================================
   Stycken och anteckningar: skapa/ta bort
   ========================================================================= */

async function deleteBlockConfirm(blockId) {
  if (state.currentNote.blocks.length <= 1) {
    alert("En anteckning måste ha minst ett stycke.");
    return;
  }
  if (!confirm("Ta bort det här stycket, inklusive alla dess versioner?")) return;
  try {
    await flushAllPendingSaves();
    const note = await API.deleteBlock(blockId);
    state.currentNote = note;
    renderEditor();
  } catch (e) {
    alert(e.message || "Kunde inte ta bort stycket.");
  }
}

/* =========================================================================
   Tema: ljust / mörkt / auto (efter tid på dygnet)
   ========================================================================= */

const THEME_KEY = "theme-preference";
const THEME_MODES = ["light", "dark", "auto"];
const THEME_LABELS = { light: "Ljust", dark: "Mörkt", auto: "Auto (efter tid)" };

function computeAutoTheme() {
  const h = new Date().getHours();
  return h >= 19 || h < 7 ? "dark" : "light";
}

function getThemeMode() {
  return localStorage.getItem(THEME_KEY) || "auto";
}

function applyTheme(mode) {
  const resolved = mode === "auto" ? computeAutoTheme() : mode;
  document.documentElement.setAttribute("data-theme", resolved);
  els.themeToggleBtn.setAttribute("data-mode", mode);
  els.themeToggleBtn.title = `Tema: ${THEME_LABELS[mode]} (tryck för att byta)`;
  if (els.themeColorMeta) {
    els.themeColorMeta.setAttribute("content", resolved === "dark" ? "#0d0d0c" : "#faf9f6");
  }
}

function setThemeMode(mode) {
  try {
    localStorage.setItem(THEME_KEY, mode);
  } catch (e) {
    /* privatläge etc. — fortsätt ändå */
  }
  applyTheme(mode);
}

function cycleTheme() {
  const current = getThemeMode();
  const next = THEME_MODES[(THEME_MODES.indexOf(current) + 1) % THEME_MODES.length];
  setThemeMode(next);
}

setInterval(() => {
  if (getThemeMode() === "auto") applyTheme("auto");
}, 60000);

/* =========================================================================
   PWA: installation + service worker
   ========================================================================= */

let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  els.installBtn.classList.remove("hidden");
});

window.addEventListener("appinstalled", () => {
  els.installBtn.classList.add("hidden");
  deferredInstallPrompt = null;
});

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* T.ex. via telefonens IP över http — appen fungerar ändå fint,
         bara utan offline-cache. Se README. */
    });
  });
}

/* =========================================================================
   Init + statiska event
   ========================================================================= */

function bindStaticEvents() {
  els.fabNewNote.addEventListener("click", async () => {
    try {
      const note = await API.createNote();
      await loadNotes();
      state.currentNote = note;
      renderNotesList();
      renderEditor();
      els.appLayout.classList.add("show-detail");
      els.noteTitleInput.focus();
    } catch (e) {
      showError(e.message);
    }
  });

  els.backBtn.addEventListener("click", closeDetail);

  els.noteTitleInput.addEventListener("input", () => {
    showSaving();
    clearTimeout(titleSaveTimer);
    const value = els.noteTitleInput.value;
    titleSaveTimer = setTimeout(async () => {
      try {
        const note = await API.updateNoteTitle(state.currentNote.id, value);
        state.currentNote.title = note.title;
        state.currentNote.updated_at = note.updated_at;
        updateNoteInListLocally();
        showSaved();
      } catch (e) {
        showError(e.message);
      }
    }, 600);
  });

  els.deleteNoteBtn.addEventListener("click", async () => {
    if (!state.currentNote) return;
    if (!confirm("Ta bort hela anteckningen? Det går inte att ångra.")) return;
    try {
      const id = state.currentNote.id;
      closeDetail();
      await API.deleteNote(id);
      await loadNotes();
    } catch (e) {
      showError(e.message);
    }
  });

  els.addBlockBtn.addEventListener("click", async () => {
    try {
      await flushAllPendingSaves();
      const note = await API.addBlock(state.currentNote.id);
      state.currentNote = note;
      renderEditor();
      const textareas = els.blocksContainer.querySelectorAll(".block-content");
      const last = textareas[textareas.length - 1];
      if (last) last.focus();
    } catch (e) {
      showError(e.message);
    }
  });

  els.themeToggleBtn.addEventListener("click", cycleTheme);

  els.installBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    els.installBtn.classList.add("hidden");
  });
}

async function init() {
 
