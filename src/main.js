/**
 * dsh-desktop-gui — Electron shell for the DeepSeek Harness browser GUI.
 *
 * It starts `dsh --profile web` (or reuses an already-running instance), waits
 * for the HTTP server, then opens a native window on it. Closing the window
 * tears the backend down so no orphaned server is left behind.
 */

import { spawn, spawnSync } from 'node:child_process'
import { app, BrowserWindow, shell } from 'electron'

const DSH_COMMAND = 'dsh'
const DSH_PROFILE_ARGS = ['--profile', 'web']
const DEFAULT_URL = 'http://127.0.0.1:3080'
const READY_TIMEOUT_MS = 30_000

/** @type {import('node:child_process').ChildProcess | null} */
let backend = null
/** @type {BrowserWindow | null} */
let mainWindow = null

/** Whether `dsh` is resolvable on PATH. */
function hasDsh() {
  const probe = spawnSync(DSH_COMMAND, ['--version'], {
    shell: process.platform === 'win32',
    stdio: 'ignore',
  })
  return probe.error === undefined
}

/** Poll `url` until it answers, or reject after `timeoutMs`. */
async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const response = await fetch(url, { method: 'GET' })
      // Any HTTP response means the server is listening; a connection error
      // would have thrown instead.
      void response
      return
    } catch {
      if (Date.now() >= deadline) {
        throw new Error(`dsh web server did not start at ${url} within ${timeoutMs}ms`)
      }
      await new Promise(resolve => setTimeout(resolve, 300))
    }
  }
}

/** Start the web backend and wait until it answers. */
async function startBackend() {
  if (!hasDsh()) {
    throw new Error('dsh was not found on PATH — install @deepseek-ai/dsh first')
  }
  backend = spawn(
    process.platform === 'win32' ? 'cmd.exe' : DSH_COMMAND,
    process.platform === 'win32'
      ? ['/d', '/s', '/c', DSH_COMMAND, ...DSH_PROFILE_ARGS]
      : [...DSH_PROFILE_ARGS],
    { stdio: 'inherit' },
  )
  await waitForServer(DEFAULT_URL, READY_TIMEOUT_MS)
}

/** Stop the backend we started. */
function stopBackend() {
  if (backend === null) return
  const child = backend
  backend = null
  if (process.platform === 'win32') {
    // The backend was launched through cmd.exe; kill the tree via taskkill.
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    child.kill('SIGTERM')
  }
}

/** Open the main window pointing at the running backend. */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    title: 'DeepSeek Harness',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  // External links (e.g. documentation) open in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  void mainWindow.loadURL(DEFAULT_URL)
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  try {
    await startBackend()
  } catch (error) {
    console.error(String(error))
    app.exit(1)
    return
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopBackend()
    app.quit()
  }
})

app.on('will-quit', () => {
  stopBackend()
})
