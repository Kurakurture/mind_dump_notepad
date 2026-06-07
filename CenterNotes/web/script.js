const editor = document.getElementById("editor");
const page = document.getElementById("page");
const windowDragHandle = document.getElementById("windowDragHandle");
const menuButton = document.getElementById("menuButton");
const menu = document.getElementById("menu");
const notesList = document.getElementById("notesList");
const newNoteButton = document.getElementById("newNoteButton");
const pinWindowButton = document.getElementById("pinWindowButton");
const fullscreenButton = document.getElementById("fullscreenButton");
const exportDumpButton = document.getElementById("exportDumpButton");
const importDumpButton = document.getElementById("importDumpButton");
const themeToggleButton = document.getElementById("themeToggleButton");
const autoFadeButton = document.getElementById("autoFadeButton");
const closeAppButton = document.getElementById("closeAppButton");
const importDumpInput = document.getElementById("importDumpInput");
const folderPath = document.getElementById("folderPath");
const decreaseTextButton = document.getElementById("decreaseTextButton");
const increaseTextButton = document.getElementById("increaseTextButton");
const textSizeValue = document.getElementById("textSizeValue");
const selectionColorPanel = document.getElementById("selectionColorPanel");
const deleteConfirm = document.getElementById("deleteConfirm");
const confirmDeleteButton = document.getElementById("confirmDeleteButton");
const cancelDeleteButton = document.getElementById("cancelDeleteButton");
const closeConfirm = document.getElementById("closeConfirm");
const confirmCloseButton = document.getElementById("confirmCloseButton");
const cancelCloseButton = document.getElementById("cancelCloseButton");
const colorButtons = document.querySelectorAll(".colorButton");
const formatButtons = document.querySelectorAll(".formatButton");

if (!window.notesAPI && window.__TAURI__?.core?.invoke) {
  const { invoke } = window.__TAURI__.core;

  window.notesAPI = {
    list: () => invoke("list_notes"),
    create: () => invoke("create_note"),
    load: (fileName) => invoke("load_note", { fileName }),
    save: (fileName, html) => invoke("save_note", { fileName, html }),
    backup: (fileName, html) => invoke("backup_note", { fileName, html }),
    delete: (fileName) => invoke("delete_note", { fileName }),
    pin: (fileName, pinned) => invoke("pin_note", { fileName, pinned }),
    secret: (fileName, secret) => invoke("secret_note", { fileName, secret }),
    setWindowPinned: (pinned) => invoke("set_window_pinned", { pinned }),
    startWindowDrag: () => invoke("start_window_drag"),
    toggleFullscreen: () => invoke("toggle_fullscreen"),
    setWindowOpacity: (opacity) => invoke("set_window_opacity", { opacity }),
    setOpenNote: (fileName) => invoke("set_open_note", { fileName }),
    getOpenNote: () => invoke("get_open_note"),
    closeApp: () => invoke("close_app"),
    path: () => invoke("notes_path")
  };
}

if (!window.notesAPI) {
  const storageKey = "centerNotes.notes";

  function readBrowserNotes() {
    return normalizeBrowserNotes(JSON.parse(localStorage.getItem(storageKey) || "[]"));
  }

  function writeBrowserNotes(notes) {
    localStorage.setItem(storageKey, JSON.stringify(notes));
  }

  function makeBrowserNoteName() {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const random = Math.random().toString(36).slice(2, 8);
    return `note-${stamp}-${random}.html`;
  }

  function makeUniqueBrowserNoteName(notes) {
    let fileName = makeBrowserNoteName();

    while (notes.some(note => note.name === fileName)) {
      fileName = makeBrowserNoteName();
    }

    return fileName;
  }

  function normalizeBrowserNotes(notes) {
    const usedNames = new Set();
    let changed = false;

    const normalized = notes.map(note => {
      let normalizedNote = note;

      if (!usedNames.has(note.name)) {
        usedNames.add(note.name);
      } else {
        const newName = makeUniqueBrowserNoteName([...notes, ...[...usedNames].map(name => ({ name }))]);
        usedNames.add(newName);
        changed = true;

        normalizedNote = {
          ...note,
          name: newName
        };
      }

      if (normalizedNote.secret && !Number.isInteger(normalizedNote.secretTitleIndex)) {
        changed = true;

        return {
          ...normalizedNote,
          secretTitleIndex: makeSecretTitleIndex(normalizedNote.name, browserNoteCreatedAt(normalizedNote))
        };
      }

      return normalizedNote;
    });

    if (changed) {
      writeBrowserNotes(normalized);
    }

    return normalized;
  }

  function browserNoteCreatedAt(note) {
    return note.created || note.modified || Date.now();
  }

  window.notesAPI = {
    list: async () => readBrowserNotes()
      .map(note => ({
        ...note,
        created: browserNoteCreatedAt(note),
        pinned: Boolean(note.pinned),
        pinnedAt: note.pinned ? note.pinnedAt || browserNoteCreatedAt(note) : 0,
        secret: Boolean(note.secret),
        secretTitleIndex: Number.isInteger(note.secretTitleIndex) ? note.secretTitleIndex : null
      }))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.pinned ? b.pinnedAt - a.pinnedAt : b.created - a.created)),
    create: async () => {
      const notes = readBrowserNotes();
      const fileName = makeUniqueBrowserNoteName(notes);
      const now = Date.now();

      notes.push({
        name: fileName,
        html: "",
        modified: now,
        created: now,
        pinned: false,
        pinnedAt: null,
        secret: false,
        secretTitleIndex: null
      });

      writeBrowserNotes(notes);

      return fileName;
    },
    load: async (fileName) => {
      const note = readBrowserNotes().find(item => item.name === fileName);
      return note ? note.html : "";
    },
    save: async (fileName, html) => {
      const notes = readBrowserNotes();
      const safeName = fileName || makeUniqueBrowserNoteName(notes);
      const index = notes.findIndex(item => item.name === safeName);
      const existingNote = notes[index];
      const note = {
        name: safeName,
        html: html || "",
        modified: Date.now(),
        created: existingNote ? browserNoteCreatedAt(existingNote) : Date.now(),
        pinned: existingNote ? Boolean(existingNote.pinned) : false,
        pinnedAt: existingNote ? existingNote.pinnedAt || null : null,
        secret: existingNote ? Boolean(existingNote.secret) : false,
        secretTitleIndex: existingNote && Number.isInteger(existingNote.secretTitleIndex) ? existingNote.secretTitleIndex : null
      };

      if (index >= 0) {
        notes[index] = note;
      } else {
        notes.push(note);
      }

      writeBrowserNotes(notes);

      return safeName;
    },
    delete: async (fileName) => {
      writeBrowserNotes(readBrowserNotes().filter(note => note.name !== fileName));
    },
    pin: async (fileName, pinned) => {
      writeBrowserNotes(readBrowserNotes().map(note => {
        if (note.name !== fileName) {
          return note;
        }

        return {
          ...note,
          pinned: Boolean(pinned),
          pinnedAt: pinned ? Date.now() : null
        };
      }));
    },
    secret: async (fileName, secret) => {
      writeBrowserNotes(readBrowserNotes().map(note => {
        if (note.name !== fileName) {
          return note;
        }

        const created = browserNoteCreatedAt(note);

        return {
          ...note,
          secret: Boolean(secret),
          secretTitleIndex: Number.isInteger(note.secretTitleIndex)
            ? note.secretTitleIndex
            : secret ? makeSecretTitleIndex(note.name, created) : null
        };
      }));
    },
    backup: async () => null,
    setWindowPinned: async (pinned) => Boolean(pinned),
    startWindowDrag: async () => null,
    toggleFullscreen: async () => {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        return true;
      }

      await document.exitFullscreen();
      return false;
    },
    setWindowOpacity: async () => true,
    setOpenNote: async (fileName) => {
      if (fileName) {
        localStorage.setItem("centerNotes.openNote", fileName);
      } else {
        localStorage.removeItem("centerNotes.openNote");
      }
    },
    getOpenNote: async () => localStorage.getItem("centerNotes.openNote"),
    closeApp: async () => window.close(),
    path: async () => "Browser local storage"
  };
}

let currentNote = null;
let isSaving = false;
let pendingSave = false;
let saveQueuePromise = null;
let editorFontSize = Number(localStorage.getItem("centerNotes.editorFontSize")) || 22;
let isDarkTheme = localStorage.getItem("centerNotes.theme") === "dark";
let isAutoFadeEnabled = localStorage.getItem("centerNotes.autoFade") === "true";
let isWindowHovered = true;
let lastMousePosition = null;
let colorPanelMoveFrame = null;
let isMousePressed = false;
let isPointerInColorPanel = false;
let isColorPanelInteracting = false;
let secretOriginalHtml = null;
let currentNoteSecret = false;
let escapePressTimer = null;
let noteTransitionPromise = Promise.resolve();
let deleteConfirmResolve = null;
let closeConfirmResolve = null;
let isWindowPinned = false;
let isAppFullscreen = Boolean(window.__TAURI__);

function updateWindowMode(isFullscreen) {
  isAppFullscreen = Boolean(isFullscreen);
  document.body.classList.toggle("fullscreenMode", Boolean(isFullscreen));
  windowDragHandle.tabIndex = isFullscreen ? -1 : 0;
  if (isFullscreen) {
    hideWindowDragHandle();
  }
  pinWindowButton.disabled = isFullscreen;
  pinWindowButton.classList.toggle("active", isWindowPinned && !isFullscreen);
  pinWindowButton.title = isWindowPinned ? "Unpin window" : "Pin window";
  pinWindowButton.setAttribute("aria-pressed", String(isWindowPinned && !isFullscreen));
}

function applyTheme() {
  document.body.classList.toggle("darkTheme", isDarkTheme);
  themeToggleButton.classList.toggle("active", isDarkTheme);
  themeToggleButton.title = isDarkTheme ? "Use light theme" : "Use dark theme";
  themeToggleButton.setAttribute("aria-pressed", String(isDarkTheme));
}

function toggleTheme() {
  isDarkTheme = !isDarkTheme;
  localStorage.setItem("centerNotes.theme", isDarkTheme ? "dark" : "light");
  applyTheme();
}

function applyAutoFadeButton() {
  autoFadeButton.classList.toggle("active", isAutoFadeEnabled);
  autoFadeButton.title = isAutoFadeEnabled ? "Disable fade when inactive" : "Fade when inactive";
  autoFadeButton.setAttribute("aria-pressed", String(isAutoFadeEnabled));
}

async function updateWindowOpacity() {
  const opacity = isAutoFadeEnabled && !isWindowHovered ? 0.46 : 1;
  await window.notesAPI.setWindowOpacity(opacity);
}

async function toggleAutoFade() {
  isAutoFadeEnabled = !isAutoFadeEnabled;
  localStorage.setItem("centerNotes.autoFade", String(isAutoFadeEnabled));
  applyAutoFadeButton();
  await updateWindowOpacity();
}

async function setWindowPinned(pinned) {
  isWindowPinned = Boolean(pinned) && !isAppFullscreen;
  await window.notesAPI.setWindowPinned(isWindowPinned);
  updateWindowMode(isAppFullscreen);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

async function animatePageOut() {
  if (prefersReducedMotion()) {
    return;
  }

  const animation = page.animate([
    { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0)" },
    { opacity: 0, transform: "translateY(34px) scale(0.985)", filter: "blur(5px)" }
  ], {
    duration: 115,
    easing: "cubic-bezier(0.55, 0, 1, 0.45)",
    fill: "forwards"
  });

  await animation.finished;
  page.style.opacity = "0";
  page.style.transform = "translateY(34px) scale(0.985)";
  page.style.filter = "blur(5px)";
  animation.cancel();
}

async function animatePageIn() {
  if (prefersReducedMotion()) {
    page.style.opacity = "";
    page.style.transform = "";
    page.style.filter = "";
    return;
  }

  const animation = page.animate([
    { opacity: 0, transform: "translateY(-30px) scale(0.99)", filter: "blur(5px)" },
    { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0)" }
  ], {
    duration: 145,
    easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    fill: "forwards"
  });

  await animation.finished;
  animation.cancel();
  page.style.opacity = "";
  page.style.transform = "";
  page.style.filter = "";
}

function applyEditorFontSize() {
  editorFontSize = Math.min(34, Math.max(16, editorFontSize));
  editor.style.fontSize = `${editorFontSize}px`;
  textSizeValue.textContent = `${editorFontSize}px`;
  localStorage.setItem("centerNotes.editorFontSize", String(editorFontSize));
}

function changeEditorFontSize(delta) {
  editorFontSize += delta;
  applyEditorFontSize();
  editor.focus();
}

function cleanWrappingStyles(element) {
  if (!element.style) {
    return;
  }

    element.style.removeProperty("white-space");
    element.style.removeProperty("word-break");
    element.style.removeProperty("overflow-wrap");
    element.style.removeProperty("word-wrap");
    element.style.removeProperty("width");
    element.style.removeProperty("min-width");
    element.style.removeProperty("max-width");

    if (!element.getAttribute("style")) {
      element.removeAttribute("style");
    }
}

function typedCharOwnColor(element) {
  return element.style.color || element.getAttribute("color") || "";
}

function mergeTypedCharRun(nodes, color) {
  const text = nodes.map(node => node.textContent.replace(/\u00a0/g, " ")).join("");

  if (!color) {
    return document.createTextNode(text);
  }

  const span = document.createElement("span");
  span.style.color = color;
  span.textContent = text;
  return span;
}

function normalizeTypedChars(root) {
  const parents = [root, ...root.querySelectorAll("*")];

  parents.forEach(parent => {
    let run = [];
    let runSignature = null;

    function flushRun() {
      if (run.length === 0) {
        return;
      }

      const replacement = mergeTypedCharRun(run, runSignature);
      run[0].before(replacement);
      run.forEach(node => node.remove());
      run = [];
      runSignature = null;
    }

    [...parent.childNodes].forEach(node => {
      if (!(node instanceof HTMLElement) || !node.classList.contains("typedChar")) {
        flushRun();
        return;
      }

      const signature = typedCharOwnColor(node);

      if (runSignature !== null && signature !== runSignature) {
        flushRun();
      }

      run.push(node);
      runSignature = signature;
    });

    flushRun();
  });
}

function normalizeTextSpaces(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  textNodes.forEach(node => {
    node.textContent = node.textContent.replace(/\u00a0/g, " ");
  });
}

function normalizeEditorMarkup(root) {
  normalizeTypedChars(root);
  normalizeTextSpaces(root);

  root.querySelectorAll("[style]").forEach(cleanWrappingStyles);
}

function normalizeNoteHtml(html) {
  const element = document.createElement("div");
  element.innerHTML = html || "";
  normalizeEditorMarkup(element);
  return element.innerHTML;
}

function cleanNoteHtml() {
  if (secretOriginalHtml !== null) {
    return secretOriginalHtml;
  }

  return editor.innerHTML;
}

function placeCaretAtEditorEnd() {
  editor.focus();

  const selection = window.getSelection();

  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function randomWarAndPeacePage() {
  const warPages = window.warAndPeacePages?.pages || [];

  if (warPages.length === 0) {
    return "Война и мир";
  }

  return warPages[Math.floor(Math.random() * warPages.length)];
}

function hashText(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function rotateLeft32(value, shift) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function mixSecretSeed(value) {
  let seed = value >>> 0;
  seed ^= seed >>> 16;
  seed = Math.imul(seed, 0x7feb352d);
  seed ^= seed >>> 15;
  seed = Math.imul(seed, 0x846ca68b);
  seed ^= seed >>> 16;
  return seed >>> 0;
}

function makeSecretTitleIndex(fileName, created) {
  const createdSeed = Math.floor(Number(created) || 0);
  const day = Math.floor(createdSeed / 86400000);
  const nameHash = hashText(fileName || "");
  const seed = (
    mixSecretSeed(createdSeed) ^
    rotateLeft32(mixSecretSeed(day * 2654435761), 17) ^
    rotateLeft32(nameHash, 23)
  ) >>> 0;

  return mixSecretSeed(seed) % 300;
}

function secretNoteTitle(note) {
  const titles = window.secretNoteTitles?.titles || [];

  if (titles.length === 0) {
    return "Новая заметка";
  }

  const savedIndex = Number.isInteger(note.secretTitleIndex) ? note.secretTitleIndex : null;
  const index = savedIndex === null
    ? makeSecretTitleIndex(note.name, note.created)
    : savedIndex;

  return titles[((index % titles.length) + titles.length) % titles.length];
}

function showSecretMask(html) {
  secretOriginalHtml = html;
  editor.textContent = randomWarAndPeacePage();
  editor.setAttribute("contenteditable", "false");
  editor.classList.add("secretMode");
  hideSelectionColorPanel();
}

function revealSecretMode() {
  if (secretOriginalHtml === null) {
    return;
  }

  editor.innerHTML = secretOriginalHtml;
  secretOriginalHtml = null;
  editor.setAttribute("contenteditable", "true");
  editor.classList.remove("secretMode");
}

async function toggleSecretMode() {
  if (secretOriginalHtml !== null) {
    revealSecretMode();
    currentNoteSecret = false;

    if (currentNote) {
      await window.notesAPI.secret(currentNote, false);
      await saveCurrentNote({ refresh: false });
      await refreshNotesList();
    }

    editor.focus();
    return;
  }

  await flushPendingSaves();

  if (!currentNote) {
    await saveCurrentNote({ refresh: false });
  }

  currentNoteSecret = true;
  await window.notesAPI.secret(currentNote, true);
  showSecretMask(editor.innerHTML);
  await refreshNotesList();
}

function noteTextPreview(html) {
  const element = document.createElement("div");
  element.innerHTML = (html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|li|h[1-6])>/gi, "\n");

  const rawText = element.textContent.replace(/\u00a0/g, " ");
  const titleMatch = rawText.match(/^([^\r\n]+)\r?\n\r?\n/);

  if (titleMatch && titleMatch[1].trim()) {
    return {
      text: titleMatch[1].trim(),
      isTitle: true
    };
  }

  const text = rawText
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("\n");

  return {
    text: text || "Пустая заметка",
    isTitle: false
  };
}

function formatCreatedDate(created) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(created || Date.now()));
}

function crc32(bytes) {
  let crc = -1;

  for (const byte of bytes) {
    crc ^= byte;

    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ -1) >>> 0;
}

function writeUint16(bytes, value) {
  bytes.push(value & 255, (value >>> 8) & 255);
}

function writeUint32(bytes, value) {
  bytes.push(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255);
}

function appendBytes(target, source) {
  for (const byte of source) {
    target.push(byte);
  }
}

function buildZip(entries) {
  const encoder = new TextEncoder();
  const fileBytes = [];
  const centralBytes = [];
  let offset = 0;

  entries.forEach(entry => {
    const nameBytes = encoder.encode(entry.name);
    const dataBytes = encoder.encode(entry.content);
    const checksum = crc32(dataBytes);
    const localHeaderOffset = offset;
    const localHeader = [];

    writeUint32(localHeader, 0x04034b50);
    writeUint16(localHeader, 20);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, 0);
    writeUint16(localHeader, 0);
    writeUint32(localHeader, checksum);
    writeUint32(localHeader, dataBytes.length);
    writeUint32(localHeader, dataBytes.length);
    writeUint16(localHeader, nameBytes.length);
    writeUint16(localHeader, 0);

    appendBytes(fileBytes, localHeader);
    appendBytes(fileBytes, nameBytes);
    appendBytes(fileBytes, dataBytes);
    offset += localHeader.length + nameBytes.length + dataBytes.length;

    writeUint32(centralBytes, 0x02014b50);
    writeUint16(centralBytes, 20);
    writeUint16(centralBytes, 20);
    writeUint16(centralBytes, 0);
    writeUint16(centralBytes, 0);
    writeUint16(centralBytes, 0);
    writeUint16(centralBytes, 0);
    writeUint32(centralBytes, checksum);
    writeUint32(centralBytes, dataBytes.length);
    writeUint32(centralBytes, dataBytes.length);
    writeUint16(centralBytes, nameBytes.length);
    writeUint16(centralBytes, 0);
    writeUint16(centralBytes, 0);
    writeUint16(centralBytes, 0);
    writeUint16(centralBytes, 0);
    writeUint32(centralBytes, 0);
    writeUint32(centralBytes, localHeaderOffset);
    centralBytes.push(...nameBytes);
  });

  const endBytes = [];
  writeUint32(endBytes, 0x06054b50);
  writeUint16(endBytes, 0);
  writeUint16(endBytes, 0);
  writeUint16(endBytes, entries.length);
  writeUint16(endBytes, entries.length);
  writeUint32(endBytes, centralBytes.length);
  writeUint32(endBytes, offset);
  writeUint16(endBytes, 0);

  return new Blob([
    new Uint8Array(fileBytes),
    new Uint8Array(centralBytes),
    new Uint8Array(endBytes)
  ], { type: "application/zip" });
}

function parseZip(buffer) {
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  const entries = {};
  let offset = 0;

  while (offset + 30 <= buffer.byteLength && view.getUint32(offset, true) === 0x04034b50) {
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const fileNameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const name = decoder.decode(new Uint8Array(buffer, nameStart, fileNameLength));

    if (flags & 8) {
      throw new Error("Unsupported ZIP format");
    }

    if (method !== 0) {
      throw new Error("Compressed ZIP entries are not supported");
    }

    entries[name] = decoder.decode(new Uint8Array(buffer, dataStart, compressedSize));
    offset = dataEnd;
  }

  return entries;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function exportNotesDump() {
  await flushPendingSaves();

  const notes = await window.notesAPI.list();
  const manifest = {
    version: 1,
    exportedAt: new Date().toISOString(),
    notes: []
  };
  const entries = [];

  for (const note of notes) {
    const html = await window.notesAPI.load(note.name);
    const path = `notes/${note.name}`;

    manifest.notes.push({
      path,
      created: note.created,
      pinned: Boolean(note.pinned),
      secret: Boolean(note.secret)
    });
    entries.push({ name: path, content: html });
  }

  entries.unshift({
    name: "mind-dump-manifest.json",
    content: JSON.stringify(manifest, null, 2)
  });

  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(buildZip(entries), `mind-dump-${stamp}.zip`);
}

function readDumpNotes(entries) {
  if (entries["mind-dump-manifest.json"]) {
    const manifest = JSON.parse(entries["mind-dump-manifest.json"]);

    return manifest.notes
      .filter(note => entries[note.path] !== undefined)
      .map(note => ({
        html: entries[note.path],
        pinned: Boolean(note.pinned),
        secret: Boolean(note.secret)
      }));
  }

  return Object.entries(entries)
    .filter(([name]) => name.toLowerCase().endsWith(".html"))
    .map(([, html]) => ({
      html,
      pinned: false,
      secret: false
    }));
}

async function importNotesDump(file) {
  const replaceCurrentNotes = window.confirm("Заменить все текущие заметки заметками из архива?\nOK - заменить, Отмена - добавить к существующим.");
  const entries = parseZip(await file.arrayBuffer());
  const importedNotes = readDumpNotes(entries);

  if (importedNotes.length === 0) {
    window.alert("В архиве не найдены заметки.");
    return;
  }

  await flushPendingSaves();

  if (replaceCurrentNotes) {
    const existingNotes = await window.notesAPI.list();

    for (const note of existingNotes) {
      await window.notesAPI.delete(note.name);
    }

    currentNote = null;
    editor.innerHTML = "";
  }

  let firstImportedNote = null;

  for (const note of importedNotes) {
    const fileName = await window.notesAPI.create();
    const normalizedHtml = normalizeNoteHtml(note.html);

    await window.notesAPI.save(fileName, note.html);

    if (normalizedHtml !== note.html) {
      await window.notesAPI.backup(fileName, note.html);
      await window.notesAPI.save(fileName, normalizedHtml);
    }

    if (note.pinned) {
      await window.notesAPI.pin(fileName, true);
    }

    if (note.secret) {
      await window.notesAPI.secret(fileName, true);
    }

    if (!firstImportedNote) {
      firstImportedNote = fileName;
    }
  }

  await openNote(firstImportedNote);
  await refreshNotesList();
}

function showMenuButton() {
  menuButton.classList.add("visible");
}

function showWindowDragHandle() {
  if (!isAppFullscreen) {
    windowDragHandle.classList.add("visible");
  }
}

function hideMenuButton() {
  if (menu.classList.contains("hidden")) {
    menuButton.classList.remove("visible");
  }
}

function hideWindowDragHandle() {
  windowDragHandle.classList.remove("visible");
}

function hideFloatingControls() {
  hideMenuButton();
  hideWindowDragHandle();
}

function animateButtonPress(button) {
  button.classList.remove("keyboardPressed");
  void button.offsetWidth;
  button.classList.add("keyboardPressed");

  window.setTimeout(() => {
    button.classList.remove("keyboardPressed");
  }, 180);
}

async function animateDeletedNoteItem(item) {
  if (!item || prefersReducedMotion()) {
    return;
  }

  await item.animate([
    { opacity: 1, transform: "translateY(0) scale(1)" },
    { opacity: 0, transform: "translateY(-6px) scale(0.985)" }
  ], {
    duration: 135,
    easing: "cubic-bezier(0.4, 0, 1, 1)",
    fill: "forwards"
  }).finished;
}

function hideDeleteConfirm(result = false) {
  if (deleteConfirm.classList.contains("hidden")) {
    return;
  }

  deleteConfirm.classList.add("hidden");

  if (deleteConfirmResolve) {
    deleteConfirmResolve(result);
    deleteConfirmResolve = null;
  }
}

function hideCloseConfirm(result = false) {
  if (closeConfirm.classList.contains("hidden")) {
    return;
  }

  closeConfirm.classList.add("hidden");

  if (closeConfirmResolve) {
    closeConfirmResolve(result);
    closeConfirmResolve = null;
  }
}

function confirmCloseApp() {
  hideCloseConfirm(false);
  closeConfirm.classList.remove("hidden");
  confirmCloseButton.focus();

  return new Promise(resolve => {
    closeConfirmResolve = resolve;
  });
}

function positionDeleteConfirm(x, y) {
  deleteConfirm.classList.remove("hidden");

  const left = Math.min(
    window.innerWidth - deleteConfirm.offsetWidth - 12,
    Math.max(12, x + 14)
  );
  const top = Math.min(
    window.innerHeight - deleteConfirm.offsetHeight - 12,
    Math.max(12, y + 14)
  );

  deleteConfirm.style.left = `${left}px`;
  deleteConfirm.style.top = `${top}px`;
}

function confirmDeleteNearCursor(event) {
  hideDeleteConfirm(false);

  const x = event?.clientX ?? lastMousePosition?.x ?? window.innerWidth / 2;
  const y = event?.clientY ?? lastMousePosition?.y ?? window.innerHeight / 2;

  positionDeleteConfirm(x, y);
  confirmDeleteButton.focus();

  return new Promise(resolve => {
    deleteConfirmResolve = resolve;
  });
}

function editorContainsSelection(selection) {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return false;
  }

  return editor.contains(selection.anchorNode) && editor.contains(selection.focusNode);
}

function hideSelectionColorPanel() {
  if (colorPanelMoveFrame) {
    window.cancelAnimationFrame(colorPanelMoveFrame);
    colorPanelMoveFrame = null;
  }

  selectionColorPanel.classList.add("hidden");
}

function positionSelectionColorPanel(x, y) {
  const verticalOffset = 20;
  const left = Math.min(
    window.innerWidth - selectionColorPanel.offsetWidth - 12,
    Math.max(12, x + 12)
  );
  const top = Math.min(
    window.innerHeight - selectionColorPanel.offsetHeight - 12,
    Math.max(12, y - selectionColorPanel.offsetHeight - verticalOffset)
  );

  selectionColorPanel.style.left = `${left}px`;
  selectionColorPanel.style.top = `${top}px`;
}

function getSelectionFocusRect(selection) {
  const focusRange = document.createRange();
  focusRange.setStart(selection.focusNode, selection.focusOffset);
  focusRange.collapse(true);

  const focusRect = focusRange.getBoundingClientRect();

  if (focusRect.width || focusRect.height) {
    return focusRect;
  }

  const range = selection.getRangeAt(0);
  const rects = [...range.getClientRects()];

  if (rects.length === 0) {
    return range.getBoundingClientRect();
  }

  return selection.focusNode === selection.anchorNode && selection.focusOffset < selection.anchorOffset
    ? rects[0]
    : rects[rects.length - 1];
}

function updateSelectionColorPanel() {
  const selection = window.getSelection();

  if (!editorContainsSelection(selection)) {
    hideSelectionColorPanel();
    return;
  }

  const rect = getSelectionFocusRect(selection);

  if (!rect.width && !rect.height) {
    hideSelectionColorPanel();
    return;
  }

  selectionColorPanel.classList.remove("hidden");

  if (lastMousePosition) {
    positionSelectionColorPanel(lastMousePosition.x, lastMousePosition.y);
    return;
  }

  positionSelectionColorPanel(rect.left + rect.width / 2, rect.top);
}

function scheduleColorPanelMove() {
  if (colorPanelMoveFrame || isPointerInColorPanel || isColorPanelInteracting) {
    return;
  }

  colorPanelMoveFrame = window.requestAnimationFrame(() => {
    colorPanelMoveFrame = null;
    updateSelectionColorPanel();
  });
}

async function refreshNotesList() {
  const notes = await window.notesAPI.list();

  notesList.innerHTML = "";

  for (const note of notes) {
    const html = await window.notesAPI.load(note.name);
    const item = document.createElement("div");
    const openButton = document.createElement("button");
    const preview = document.createElement("span");
    const createdDate = document.createElement("span");
    const actions = document.createElement("div");
    const secretIcon = document.createElement("span");
    const pinButton = document.createElement("button");
    const deleteButton = document.createElement("button");
    const previewData = note.secret
      ? { text: secretNoteTitle(note), isTitle: true }
      : noteTextPreview(html);

    item.className = "noteItem";
    openButton.className = "noteOpenButton";
    preview.className = "notePreview";
    preview.textContent = previewData.text;
    createdDate.className = "noteCreatedDate";
    createdDate.textContent = formatCreatedDate(note.created);
    actions.className = "noteActions";
    secretIcon.className = "secretNoteIcon";
    secretIcon.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    `;
    secretIcon.title = "Secret note";
    pinButton.className = "pinNoteButton";
    pinButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 3.8 2.5 5 5.5.8-4 3.9 1 5.5-5-2.6L7 19l1-5.5-4-3.9 5.5-.8L12 3.8Z"></path>
      </svg>
    `;
    pinButton.title = note.pinned ? "Unpin note" : "Pin note";
    deleteButton.className = "deleteNoteButton";
    deleteButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16"></path>
        <path d="M10 11v6"></path>
        <path d="M14 11v6"></path>
        <path d="M6 7l1 13h10l1-13"></path>
        <path d="M9 7V4h6v3"></path>
      </svg>
    `;
    deleteButton.title = notes.length <= 1 ? "Cannot delete the last note" : "Удалить заметку";
    deleteButton.disabled = notes.length <= 1;

    if (note.name === currentNote) {
      item.classList.add("active");
    }

    if (note.pinned) {
      item.classList.add("pinned");
    }

    if (note.secret) {
      item.classList.add("secret");
    }

    if (previewData.isTitle) {
      preview.classList.add("titlePreview");
    }

    openButton.addEventListener("click", async () => {
      if (note.name === currentNote) {
        editor.focus();
        return;
      }

      await flushPendingSaves();
      await saveCurrentNote({ refresh: false });
      await openNote(note.name);
    });

    deleteButton.addEventListener("click", async (event) => {
      await deleteNote(note.name, item, event);
    });

    pinButton.addEventListener("click", async () => {
      await toggleNotePin(note.name, !note.pinned);
    });

    openButton.appendChild(preview);
    openButton.appendChild(createdDate);
    if (note.secret) {
      actions.appendChild(secretIcon);
    }
    actions.appendChild(pinButton);
    actions.appendChild(deleteButton);
    item.appendChild(openButton);
    item.appendChild(actions);
    notesList.appendChild(item);
  }
}

async function setOpenNote(fileName) {
  revealSecretMode();
  currentNote = fileName;
  await window.notesAPI.setOpenNote(fileName);
  currentNoteSecret = false;
  const html = await window.notesAPI.load(fileName);
  const normalizedHtml = normalizeNoteHtml(html);
  const notes = await window.notesAPI.list();
  const note = notes.find(item => item.name === fileName);

  editor.innerHTML = normalizedHtml;

  if (normalizedHtml !== html) {
    await window.notesAPI.backup(fileName, html);
    await window.notesAPI.save(fileName, normalizedHtml);
  }

  currentNoteSecret = Boolean(note?.secret);

  if (currentNoteSecret) {
    showSecretMask(normalizedHtml);
  }

  await refreshNotesList();

  if (!currentNoteSecret) {
    placeCaretAtEditorEnd();
  }
}

async function openNote(fileName) {
  const transition = noteTransitionPromise
    .catch(() => null)
    .then(async () => {
      await animatePageOut();

      try {
        await setOpenNote(fileName);
      } finally {
        await animatePageIn();
      }
    });

  noteTransitionPromise = transition;
  return transition;
}

async function createNote() {
  await flushPendingSaves();

  if (currentNote) {
    await saveCurrentNote({ refresh: false });
  }

  const fileName = await window.notesAPI.create();
  await openNote(fileName);
}

async function deleteNote(fileName, item, event) {
  const notesBeforeDelete = await window.notesAPI.list();

  if (notesBeforeDelete.length <= 1) {
    window.alert("Последнюю заметку удалить нельзя.");
    return;
  }

  if (!(await confirmDeleteNearCursor(event))) {
    return;
  }

  const deletedIndex = notesBeforeDelete.findIndex(note => note.name === fileName);

  if (deletedIndex < 0) {
    await refreshNotesList();
    return;
  }

  const replacementNote = notesBeforeDelete[deletedIndex - 1] || notesBeforeDelete[deletedIndex + 1];

  await flushPendingSaves();

  if (currentNote && currentNote !== fileName) {
    await saveCurrentNote({ refresh: false });
  }

  await animateDeletedNoteItem(item);
  await window.notesAPI.delete(fileName);

  if (!replacementNote) {
    await window.notesAPI.setOpenNote(null);
    await refreshNotesList();
    return;
  }

  await openNote(replacementNote.name);
}

async function toggleNotePin(fileName, pinned) {
  await flushPendingSaves();
  await window.notesAPI.pin(fileName, pinned);
  await refreshNotesList();
}

async function saveCurrentNote({ refresh = true } = {}) {
  if (!currentNote) {
    currentNote = await window.notesAPI.create();
    await window.notesAPI.setOpenNote(currentNote);
  }

  currentNote = await window.notesAPI.save(currentNote, cleanNoteHtml());

  if (refresh) {
    await refreshNotesList();
  }
}

async function runSaveQueue() {
  if (isSaving) {
    return;
  }

  isSaving = true;

  try {
    while (pendingSave) {
      pendingSave = false;
      await saveCurrentNote({ refresh: false });
    }
  } finally {
    isSaving = false;
    saveQueuePromise = null;
  }
}

function saveNow() {
  pendingSave = true;

  if (!saveQueuePromise) {
    saveQueuePromise = runSaveQueue();
  }

  return saveQueuePromise;
}

async function flushPendingSaves() {
  if (saveQueuePromise) {
    await saveQueuePromise;
  }
}

async function closeApp() {
  if (!(await confirmCloseApp())) {
    return;
  }

  await flushPendingSaves();
  await saveCurrentNote({ refresh: false });
  await window.notesAPI.setOpenNote(currentNote);
  await window.notesAPI.closeApp();
}

function clearSelectionFormatting() {
  document.execCommand("removeFormat", false, null);
  document.execCommand("unlink", false, null);

  for (let level = 0; level < 20; level += 1) {
    document.execCommand("outdent", false, null);
  }

  document.execCommand("formatBlock", false, "div");
  document.execCommand("justifyLeft", false, null);

  const selection = window.getSelection();

  if (!editorContainsSelection(selection)) {
    return;
  }

  const range = selection.getRangeAt(0);
  const elements = [editor, ...editor.querySelectorAll("*")];

  elements.forEach(element => {
    if (element === editor || !range.intersectsNode(element)) {
      return;
    }

    element.removeAttribute("style");
    element.removeAttribute("class");
    element.removeAttribute("color");
    element.removeAttribute("face");
    element.removeAttribute("size");
    element.removeAttribute("align");
    element.removeAttribute("dir");
    element.removeAttribute("width");
    element.removeAttribute("height");
  });
}

function applyColor(color) {
  editor.focus();

  const selection = window.getSelection();

  if (!editorContainsSelection(selection)) {
    return;
  }

  if (color === "clear") {
    clearSelectionFormatting();
    saveNow();
    hideSelectionColorPanel();
    return;
  }

  document.execCommand("styleWithCSS", false, true);
  document.execCommand("foreColor", false, color);

  saveNow();
  hideSelectionColorPanel();
}

function applyFormat(command) {
  editor.focus();

  const selection = window.getSelection();

  if (!editorContainsSelection(selection)) {
    return;
  }

  document.execCommand("styleWithCSS", false, true);
  document.execCommand(command, false, null);

  saveNow();
  hideSelectionColorPanel();
}

function insertDefaultFormattedText(text) {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) {
    return;
  }

  const range = selection.getRangeAt(0);
  const startMarker = document.createElement("span");
  const endMarker = document.createElement("span");
  const pastedText = document.createTextNode(text);
  const fragment = document.createDocumentFragment();

  range.deleteContents();
  fragment.append(startMarker, pastedText, endMarker);
  range.insertNode(fragment);

  const pastedRange = document.createRange();
  pastedRange.setStartAfter(startMarker);
  pastedRange.setEndBefore(endMarker);
  selection.removeAllRanges();
  selection.addRange(pastedRange);
  document.execCommand("removeFormat", false, null);

  startMarker.remove();

  const caretRange = document.createRange();
  caretRange.setStartBefore(endMarker);
  caretRange.collapse(true);
  endMarker.remove();
  selection.removeAllRanges();
  selection.addRange(caretRange);
}

function finishColorPanelInteraction() {
  window.setTimeout(() => {
    isColorPanelInteracting = false;
    selectionColorPanel.classList.remove("interacting");
  }, 0);
}

menuButton.addEventListener("click", async () => {
  menu.classList.toggle("hidden");

  if (!menu.classList.contains("hidden")) {
    showMenuButton();
    await refreshNotesList();
  } else {
    hideMenuButton();
  }
});

newNoteButton.addEventListener("click", async () => {
  await createNote();
});

fullscreenButton.addEventListener("click", async () => {
  const isFullscreen = await window.notesAPI.toggleFullscreen();
  if (isFullscreen && isWindowPinned) {
    await setWindowPinned(false);
  }
  updateWindowMode(isFullscreen);
});

pinWindowButton.addEventListener("click", async () => {
  if (isAppFullscreen) {
    return;
  }

  await setWindowPinned(!isWindowPinned);
});

windowDragHandle.addEventListener("pointerdown", async (event) => {
  if (isAppFullscreen || event.button !== 0) {
    return;
  }

  event.preventDefault();
  await window.notesAPI.startWindowDrag();
});

exportDumpButton.addEventListener("click", async () => {
  await exportNotesDump();
});

importDumpButton.addEventListener("click", () => {
  importDumpInput.click();
});

themeToggleButton.addEventListener("click", () => {
  toggleTheme();
});

autoFadeButton.addEventListener("click", async () => {
  await toggleAutoFade();
});

closeAppButton.addEventListener("click", async () => {
  await closeApp();
});

importDumpInput.addEventListener("change", async () => {
  const [file] = importDumpInput.files;

  if (!file) {
    return;
  }

  try {
    await importNotesDump(file);
  } catch {
    window.alert("Не удалось импортировать архив.");
  } finally {
    importDumpInput.value = "";
  }
});

confirmDeleteButton.addEventListener("click", () => {
  hideDeleteConfirm(true);
});

cancelDeleteButton.addEventListener("click", () => {
  hideDeleteConfirm(false);
});

confirmCloseButton.addEventListener("click", () => {
  hideCloseConfirm(true);
});

cancelCloseButton.addEventListener("click", () => {
  hideCloseConfirm(false);
});

decreaseTextButton.addEventListener("click", () => {
  changeEditorFontSize(-2);
});

increaseTextButton.addEventListener("click", () => {
  changeEditorFontSize(2);
});

editor.addEventListener("input", () => {
  hideFloatingControls();
  hideSelectionColorPanel();
  saveNow();
});

editor.addEventListener("pointerdown", () => {
  menu.classList.add("hidden");
  hideFloatingControls();
});

editor.addEventListener("beforeinput", (event) => {
  if (event.inputType !== "insertText" || !event.data) {
    return;
  }

  hideFloatingControls();
});

editor.addEventListener("paste", (event) => {
  event.preventDefault();
  insertDefaultFormattedText(event.clipboardData?.getData("text/plain") || "");
  hideFloatingControls();
  hideSelectionColorPanel();
  saveNow();
});

colorButtons.forEach(button => {
  button.addEventListener("click", () => {
    applyColor(button.dataset.color);
    finishColorPanelInteraction();
  });
});

formatButtons.forEach(button => {
  button.addEventListener("click", () => {
    applyFormat(button.dataset.command);
    finishColorPanelInteraction();
  });
});

selectionColorPanel.addEventListener("mousedown", (event) => {
  event.preventDefault();
});

selectionColorPanel.addEventListener("pointerdown", () => {
  const rect = selectionColorPanel.getBoundingClientRect();

  if (colorPanelMoveFrame) {
    window.cancelAnimationFrame(colorPanelMoveFrame);
    colorPanelMoveFrame = null;
  }

  isColorPanelInteracting = true;
  selectionColorPanel.classList.add("interacting");
  selectionColorPanel.style.left = `${rect.left}px`;
  selectionColorPanel.style.top = `${rect.top}px`;
});

selectionColorPanel.addEventListener("pointerenter", () => {
  isPointerInColorPanel = true;
});

selectionColorPanel.addEventListener("pointerleave", () => {
  isPointerInColorPanel = false;
});

document.addEventListener("selectionchange", () => {
  scheduleColorPanelMove();
});

document.addEventListener("mousedown", (event) => {
  const isColorPanelEvent = selectionColorPanel.contains(event.target);

  if (isColorPanelEvent) {
    isMousePressed = false;
  } else {
    isMousePressed = true;
    lastMousePosition = {
      x: event.clientX,
      y: event.clientY
    };
  }

  if (!deleteConfirm.classList.contains("hidden") && !deleteConfirm.contains(event.target)) {
    hideDeleteConfirm(false);
  }

  if (!closeConfirm.classList.contains("hidden") && !closeConfirm.contains(event.target)) {
    hideCloseConfirm(false);
  }

  if (!editor.contains(event.target) && !selectionColorPanel.contains(event.target)) {
    hideSelectionColorPanel();
  }
});

document.addEventListener("mouseup", () => {
  isMousePressed = false;
});

document.addEventListener("mousemove", (event) => {
  if (!selectionColorPanel.contains(event.target) && isMousePressed && editorContainsSelection(window.getSelection())) {
    lastMousePosition = {
      x: event.clientX,
      y: event.clientY
    };
    scheduleColorPanelMove();
  }

  if (event.clientY <= 72) {
    showMenuButton();
    showWindowDragHandle();
  } else {
    hideFloatingControls();
  }
});

document.addEventListener("mouseleave", () => {
  isWindowHovered = false;
  updateWindowOpacity();
  hideFloatingControls();
  hideSelectionColorPanel();
});

document.addEventListener("mouseenter", () => {
  isWindowHovered = true;
  updateWindowOpacity();
});

document.addEventListener("mouseout", (event) => {
  if (!event.relatedTarget) {
    hideFloatingControls();
    hideSelectionColorPanel();
  }
});

window.addEventListener("blur", () => {
  hideFloatingControls();
  hideSelectionColorPanel();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !closeConfirm.classList.contains("hidden")) {
    event.preventDefault();
    hideCloseConfirm(false);
    return;
  }

  if (event.key === "Escape" && !deleteConfirm.classList.contains("hidden")) {
    event.preventDefault();
    hideDeleteConfirm(false);
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();

    if (escapePressTimer) {
      window.clearTimeout(escapePressTimer);
      escapePressTimer = null;
      toggleSecretMode();
      return;
    }

    escapePressTimer = window.setTimeout(() => {
      escapePressTimer = null;
      animateButtonPress(menuButton);
      menu.classList.toggle("hidden");

      if (!menu.classList.contains("hidden")) {
        showMenuButton();
        refreshNotesList();
      } else {
        hideMenuButton();
      }
    }, 260);
  }
});

document.addEventListener("touchstart", (event) => {
  if (event.touches[0] && event.touches[0].clientY <= 72) {
    showMenuButton();
    showWindowDragHandle();
  }
});

document.addEventListener("fullscreenchange", () => {
  updateWindowMode(Boolean(document.fullscreenElement));
});

window.addEventListener("beforeunload", saveCurrentNote);

async function init() {
  applyTheme();
  applyAutoFadeButton();
  await updateWindowOpacity();
  applyEditorFontSize();
  updateWindowMode(Boolean(document.fullscreenElement));
  folderPath.textContent = await window.notesAPI.path();

  const notes = await window.notesAPI.list();

  if (notes.length > 0) {
    const savedOpenNote = await window.notesAPI.getOpenNote();
    const noteToOpen = notes.some(note => note.name === savedOpenNote)
      ? savedOpenNote
      : notes[0].name;

    await openNote(noteToOpen);
  } else {
    await createNote();
  }

  hideFloatingControls();
}

init();
