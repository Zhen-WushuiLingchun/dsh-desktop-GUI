/**
 * DSH Desktop — native Electron shell for the DeepSeek Harness WebUI.
 *
 * The WebUI remains the only product frontend. This process owns startup,
 * windowing, safe external navigation, and (when needed) backend teardown.
 */

import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { app, BrowserWindow, dialog, shell } from 'electron'

import { fetchLatestRelease, isNewerVersion } from './update.js'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const DSH_COMMAND = 'dsh'
const DSH_PROFILE_ARGS = ['--profile', 'web']
const DEFAULT_URL = 'http://127.0.0.1:3080'
const READY_TIMEOUT_MS = 30_000
const PROBE_TIMEOUT_MS = 1_500
const MAX_DIAGNOSTIC_CHARS = 16_000
const DSH_BOOT_MARKER = 'window.__DSH_BOOT__'
const APP_ID = 'dev.dsh.desktopgui'
const UPDATE_TIMEOUT_MS = 5_000

/** @type {import('node:child_process').ChildProcess | null} */
let backend = null
/** @type {BrowserWindow | null} */
let mainWindow = null
let ownsBackend = false
let serverReady = false
let quitting = false
let backendExitError = null
let backendOutput = ''
let updateCheckStarted = false

function appendBackendOutput(chunk) {
  backendOutput += String(chunk)
  if (backendOutput.length > MAX_DIAGNOSTIC_CHARS) {
    backendOutput = backendOutput.slice(-MAX_DIAGNOSTIC_CHARS)
  }
}

function cleanDiagnostic(text) {
  return String(text)
    .replaceAll(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replaceAll(/\r\n/g, '\n')
    .trim()
}

function windowsCommand(command, args) {
  return {
    command: process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/s', '/c', command, ...args],
  }
}

function dshInvocation(args) {
  return process.platform === 'win32'
    ? windowsCommand(DSH_COMMAND, args)
    : { command: DSH_COMMAND, args }
}

/** Whether `dsh` is resolvable and executable on PATH. */
function hasDsh() {
  const invocation = dshInvocation(['--version'])
  const probe = spawnSync(invocation.command, invocation.args, {
    windowsHide: true,
    stdio: 'ignore',
    timeout: 5_000,
  })
  return probe.error === undefined && probe.status === 0
}

/** Return true only when `url` serves a recognizable DSH WebUI document. */
async function probeDshServer(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) return false
    return (await response.text()).includes(DSH_BOOT_MARKER)
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

/** Poll until a DSH WebUI answers, the child exits, or the deadline passes. */
async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (backendExitError !== null) throw backendExitError
    if (await probeDshServer(url)) return
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  throw new Error(`DSH WebUI did not start at ${url} within ${Math.round(timeoutMs / 1000)} seconds.`)
}

/** Reuse an existing DSH server, otherwise start one without a console window. */
async function ensureBackend() {
  if (backend !== null && serverReady && await probeDshServer(DEFAULT_URL)) {
    return { reused: false }
  }

  if (await probeDshServer(DEFAULT_URL)) {
    serverReady = true
    ownsBackend = false
    return { reused: true }
  }

  if (!hasDsh()) {
    throw new Error('The dsh command was not found on PATH. Install @deepseek-ai/dsh, then restart DSH Desktop.')
  }

  const invocation = dshInvocation(DSH_PROFILE_ARGS)
  backendExitError = null
  backendOutput = ''
  serverReady = false
  ownsBackend = true
  backend = spawn(invocation.command, invocation.args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
  })
  backend.stdout?.on('data', appendBackendOutput)
  backend.stderr?.on('data', appendBackendOutput)
  backend.once('error', (error) => {
    backendExitError = new Error(`Could not launch DSH: ${error.message}`)
  })
  backend.once('exit', (code, signal) => {
    const unexpected = !quitting && serverReady
    const detail = cleanDiagnostic(backendOutput)
    backend = null
    ownsBackend = false
    if (!serverReady) {
      backendExitError = new Error(
        `DSH exited before the WebUI became ready (code ${String(code)}, signal ${String(signal)}).${detail ? `\n\n${detail}` : ''}`,
      )
    } else if (unexpected) {
      serverReady = false
      void showErrorPage(
        `The DSH backend stopped unexpectedly (code ${String(code)}, signal ${String(signal)}).`,
        detail,
      )
    }
  })

  await waitForServer(DEFAULT_URL, READY_TIMEOUT_MS)
  serverReady = true
  return { reused: false }
}

/** Stop only the backend process tree owned by this desktop instance. */
function stopBackend() {
  if (!ownsBackend || backend === null) return
  const child = backend
  backend = null
  ownsBackend = false
  serverReady = false
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
      timeout: 5_000,
    })
  } else {
    child.kill('SIGTERM')
  }
}

function isAllowedWebUiUrl(url) {
  try {
    return new URL(url).origin === new URL(DEFAULT_URL).origin
  } catch {
    return false
  }
}

function isSafeExternalUrl(url) {
  try {
    return ['https:', 'http:', 'mailto:'].includes(new URL(url).protocol)
  } catch {
    return false
  }
}

function configureNavigation(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedWebUiUrl(url)) {
      void window.loadURL(url)
    } else if (isSafeExternalUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file:') || isAllowedWebUiUrl(url)) return
    event.preventDefault()
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
  })
}

/** Check GitHub Releases once per app process; never block or mutate startup. */
async function checkForUpdates() {
  if (updateCheckStarted) return
  updateCheckStarted = true

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), UPDATE_TIMEOUT_MS)
  try {
    const release = await fetchLatestRelease({
      signal: controller.signal,
      userAgent: `DSH-Desktop/${app.getVersion()}`,
    })
    if (release === null || !isNewerVersion(release.version, app.getVersion())) return

    const options = {
      type: 'info',
      title: 'DSH Desktop 有新版本',
      message: `发现 DSH Desktop ${release.version}`,
      detail: `当前版本为 ${app.getVersion()}。是否前往 GitHub Releases 下载新版本？`,
      buttons: ['前往下载', '稍后'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    }
    const result = mainWindow !== null && !mainWindow.isDestroyed()
      ? await dialog.showMessageBox(mainWindow, options)
      : await dialog.showMessageBox(options)
    if (result.response === 0) await shell.openExternal(release.url)
  } catch (error) {
    // Update availability is never allowed to delay or break local DSH startup.
    console.warn(`[updates] ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    clearTimeout(timeout)
  }
}

/** Create the native shell immediately; the local status page covers startup. */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'DSH Desktop',
    icon: join(app.getAppPath(), 'assets', 'app-icon.png'),
    backgroundColor: '#07111f',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  configureNavigation(mainWindow)
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function showStatusPage(state, detail = '') {
  if (mainWindow === null || mainWindow.isDestroyed()) return
  await mainWindow.loadFile(join(currentDirectory, 'startup.html'), {
    query: { state, detail },
  })
}

async function showErrorPage(message, diagnostic = '') {
  const detail = [message, cleanDiagnostic(diagnostic)].filter(Boolean).join('\n\n')
  await showStatusPage('error', detail)
}

async function boot() {
  createWindow()
  await showStatusPage('starting')
  try {
    await ensureBackend()
    if (mainWindow !== null && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(DEFAULT_URL)
      mainWindow.show()
      void checkForUpdates()
    }
  } catch (error) {
    await showErrorPage(error instanceof Error ? error.message : String(error), backendOutput)
  }
}

app.setAppUserModelId(APP_ID)

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow === null) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(() => boot())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void boot()
  })

  app.on('before-quit', () => {
    quitting = true
    stopBackend()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
