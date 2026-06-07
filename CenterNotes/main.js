const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow;
let opacityAnimationTimer = null;
let currentWindowOpacity = 1;

const notesDir = path.join(app.getPath("documents"), "MindDump");
const metadataPath = path.join(notesDir, "metadata.json");
const appStatePath = path.join(notesDir, "app-state.json");

function ensureNotesDir() {
  if (!fs.existsSync(notesDir)) {
    fs.mkdirSync(notesDir, { recursive: true });
  }
}

function safeFileName(name) {
  return name.replace(/[\\/:*?"<>|]/g, "").trim();
}

function makeNoteName() {
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const random = Math.random().toString(36).slice(2, 8);
  return `note-${stamp}-${random}.html`;
}

function makeUniqueNoteName() {
  let fileName = makeNoteName();

  while (fs.existsSync(path.join(notesDir, fileName))) {
    fileName = makeNoteName();
  }

  return fileName;
}

function readMetadata() {
  ensureNotesDir();

  if (!fs.existsSync(metadataPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  } catch {
    return {};
  }
}

function writeMetadata(metadata) {
  ensureNotesDir();
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf8");
}

function readAppState() {
  ensureNotesDir();

  if (!fs.existsSync(appStatePath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(appStatePath, "utf8"));
  } catch {
    return {};
  }
}

function writeAppState(state) {
  ensureNotesDir();
  fs.writeFileSync(appStatePath, JSON.stringify(state, null, 2), "utf8");
}

function updateAppState(update) {
  const state = readAppState();
  update(state);
  writeAppState(state);
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isFullScreen()) {
    return;
  }

  updateAppState(state => {
    state.window = mainWindow.getBounds();
  });
}

function animateWindowOpacity(targetOpacity) {
  if (!mainWindow) {
    return false;
  }

  const target = Math.min(1, Math.max(0.2, Number(targetOpacity) || 1));
  const start = currentWindowOpacity;
  const duration = 180;
  const startedAt = Date.now();

  if (opacityAnimationTimer) {
    clearInterval(opacityAnimationTimer);
    opacityAnimationTimer = null;
  }

  if (Math.abs(start - target) < 0.01) {
    currentWindowOpacity = target;
    mainWindow.setOpacity(target);
    return true;
  }

  opacityAnimationTimer = setInterval(() => {
    if (!mainWindow) {
      clearInterval(opacityAnimationTimer);
      opacityAnimationTimer = null;
      return;
    }

    const progress = Math.min(1, (Date.now() - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    currentWindowOpacity = start + (target - start) * eased;
    mainWindow.setOpacity(currentWindowOpacity);

    if (progress >= 1) {
      clearInterval(opacityAnimationTimer);
      opacityAnimationTimer = null;
      currentWindowOpacity = target;
      mainWindow.setOpacity(target);
    }
  }, 16);

  return true;
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
  const daySeed = Math.floor(createdSeed / 86400000) * 2654435761;
  const nameHash = hashText(fileName || "");
  const seed = (
    mixSecretSeed(createdSeed) ^
    rotateLeft32(mixSecretSeed(daySeed), 17) ^
    rotateLeft32(nameHash, 23)
  ) >>> 0;

  return mixSecretSeed(seed) % 300;
}

function noteMetadata(fileName, stat) {
  const metadata = readMetadata();
  const existing = metadata[fileName] || {};
  const created = existing.created || stat.birthtimeMs || stat.ctimeMs;
  const pinned = Boolean(existing.pinned);
  const pinnedAt = pinned ? existing.pinnedAt || created : null;
  const secret = Boolean(existing.secret);
  const secretTitleIndex = Number.isInteger(existing.secretTitleIndex)
    ? existing.secretTitleIndex
    : secret ? makeSecretTitleIndex(fileName, created) : null;

  if (!existing.created || existing.pinned !== pinned || existing.pinnedAt !== pinnedAt || existing.secret !== secret || existing.secretTitleIndex !== secretTitleIndex) {
    metadata[fileName] = {
      ...existing,
      created,
      pinned,
      pinnedAt,
      secret,
      secretTitleIndex
    };
    writeMetadata(metadata);
  }

  return metadata[fileName];
}

function createWindow() {
  const savedState = readAppState();
  const savedBounds = savedState.window || {};

  mainWindow = new BrowserWindow({
    x: Number.isFinite(savedBounds.x) ? savedBounds.x : undefined,
    y: Number.isFinite(savedBounds.y) ? savedBounds.y : undefined,
    width: Number.isFinite(savedBounds.width) ? savedBounds.width : 1200,
    height: Number.isFinite(savedBounds.height) ? savedBounds.height : 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#f7f3ea",
    title: "Mind Dump",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join("web", "index.html"));
  mainWindow.on("move", saveWindowState);
  mainWindow.on("resize", saveWindowState);
  mainWindow.on("close", saveWindowState);
}

app.whenReady().then(() => {
  ensureNotesDir();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("notes:list", async () => {
  ensureNotesDir();

  return fs.readdirSync(notesDir)
    .filter(file => file.endsWith(".html") && !file.endsWith(".backup-before-conversion.html"))
    .map(file => {
      const fullPath = path.join(notesDir, file);
      const stat = fs.statSync(fullPath);
      const metadata = noteMetadata(file, stat);

      return {
        name: file,
        modified: stat.mtimeMs,
        created: metadata.created,
        pinned: metadata.pinned,
        pinnedAt: metadata.pinnedAt || 0,
        secret: Boolean(metadata.secret),
        secretTitleIndex: metadata.secretTitleIndex
      };
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.pinned ? b.pinnedAt - a.pinnedAt : b.created - a.created));
});

ipcMain.handle("notes:new", async () => {
  ensureNotesDir();

  const fileName = makeUniqueNoteName();
  const fullPath = path.join(notesDir, fileName);
  const metadata = readMetadata();
  const now = Date.now();

  fs.writeFileSync(fullPath, "", "utf8");
  metadata[fileName] = {
    created: now,
    pinned: false,
    pinnedAt: null,
    secret: false,
    secretTitleIndex: null
  };
  writeMetadata(metadata);

  return fileName;
});

ipcMain.handle("notes:load", async (_event, fileName) => {
  ensureNotesDir();

  const safeName = safeFileName(fileName);
  const fullPath = path.join(notesDir, safeName);

  if (!fs.existsSync(fullPath)) return "";

  return fs.readFileSync(fullPath, "utf8");
});

ipcMain.handle("notes:save", async (_event, fileName, html) => {
  ensureNotesDir();

  const safeName = safeFileName(fileName || makeNoteName());
  const fullPath = path.join(notesDir, safeName);

  fs.writeFileSync(fullPath, html || "", "utf8");

  return safeName;
});

ipcMain.handle("notes:backup", async (_event, fileName, html) => {
  ensureNotesDir();

  const safeName = safeFileName(fileName);
  const backupName = `${safeName}.backup-before-conversion.html`;
  const backupPath = path.join(notesDir, backupName);

  if (!fs.existsSync(backupPath)) {
    fs.writeFileSync(backupPath, html || "", "utf8");
  }

  return backupName;
});

ipcMain.handle("notes:delete", async (_event, fileName) => {
  ensureNotesDir();

  const safeName = safeFileName(fileName);
  const fullPath = path.join(notesDir, safeName);

  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }

  const metadata = readMetadata();
  delete metadata[safeName];
  writeMetadata(metadata);
});

ipcMain.handle("notes:pin", async (_event, fileName, pinned) => {
  ensureNotesDir();

  const safeName = safeFileName(fileName);
  const fullPath = path.join(notesDir, safeName);

  if (!fs.existsSync(fullPath)) {
    return;
  }

  const metadata = readMetadata();
  const stat = fs.statSync(fullPath);

  metadata[safeName] = {
    ...metadata[safeName],
    created: metadata[safeName]?.created || stat.birthtimeMs || stat.ctimeMs,
    pinned: Boolean(pinned),
    pinnedAt: pinned ? Date.now() : null,
    secret: Boolean(metadata[safeName]?.secret),
    secretTitleIndex: metadata[safeName]?.secretTitleIndex ?? null
  };

  writeMetadata(metadata);
});

ipcMain.handle("notes:secret", async (_event, fileName, secret) => {
  ensureNotesDir();

  const safeName = safeFileName(fileName);
  const fullPath = path.join(notesDir, safeName);

  if (!fs.existsSync(fullPath)) {
    return;
  }

  const metadata = readMetadata();
  const stat = fs.statSync(fullPath);
  const existing = metadata[safeName] || {};
  const pinned = Boolean(existing.pinned);
  const created = existing.created || stat.birthtimeMs || stat.ctimeMs;
  const secretTitleIndex = Number.isInteger(existing.secretTitleIndex)
    ? existing.secretTitleIndex
    : secret ? makeSecretTitleIndex(safeName, created) : null;

  metadata[safeName] = {
    ...existing,
    created,
    pinned,
    pinnedAt: pinned ? existing.pinnedAt || Date.now() : null,
    secret: Boolean(secret),
    secretTitleIndex
  };

  writeMetadata(metadata);
});

ipcMain.handle("notes:path", async () => {
  ensureNotesDir();
  return notesDir;
});

ipcMain.handle("app:set-open-note", async (_event, fileName) => {
  updateAppState(state => {
    const safeName = fileName ? safeFileName(fileName) : "";
    state.openNote = safeName || null;
  });
});

ipcMain.handle("app:get-open-note", async () => readAppState().openNote || null);

ipcMain.handle("app:close", async () => {
  saveWindowState();
  app.quit();
});

ipcMain.handle("window:toggle-fullscreen", async () => {
  if (!mainWindow) {
    return false;
  }

  const shouldFullscreen = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(shouldFullscreen);
  return shouldFullscreen;
});

ipcMain.handle("window:set-opacity", async (_event, opacity) => animateWindowOpacity(opacity));
