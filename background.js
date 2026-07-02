const ALARM_NAME = "privacy-spotlight-auto-lock";
let locked = false;
let lastActivity = Date.now();

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 210000 },
    key,
    256
  );
  return bytesToBase64(new Uint8Array(bits));
}

async function ensureDefaultPassword() {
  const current = await chrome.storage.sync.get({
    passwordHash: "",
    passwordSalt: "",
    passwordLength: 0
  });
  if (current.passwordHash && current.passwordSalt) return;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await chrome.storage.sync.set({
    passwordHash: await hashPassword("0000", salt),
    passwordSalt: bytesToBase64(salt),
    passwordLength: 4
  });
}

async function getLockSettings() {
  return chrome.storage.sync.get({
    enabled: true,
    autoLockEnabled: true,
    idleTimeout: 20,
    passwordHash: "",
    passwordSalt: ""
  });
}

async function broadcastLockState() {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(
    tabs.map((tab) =>
      chrome.tabs.sendMessage(tab.id, {
        type: "privacy-spotlight-lock-state",
        locked
      })
    )
  );
}

async function setGlobalLocked(next) {
  locked = next;
  if (!locked) lastActivity = Date.now();
  await chrome.storage.session.set({ globalLocked: locked, lastActivity });
  await broadcastLockState();
  if (!locked) await scheduleLock();
}

async function scheduleLock() {
  await chrome.alarms.clear(ALARM_NAME);
  const settings = await getLockSettings();
  const canLock =
    settings.enabled &&
    settings.autoLockEnabled &&
    settings.idleTimeout > 0 &&
    Boolean(settings.passwordHash && settings.passwordSalt);
  if (!canLock || locked) return;
  chrome.alarms.create(ALARM_NAME, {
    when: lastActivity + settings.idleTimeout * 1000
  });
}

async function recordActivity() {
  if (locked) return;
  lastActivity = Date.now();
  await chrome.storage.session.set({ lastActivity });
  await scheduleLock();
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaultPassword();
  await setGlobalLocked(false);
});
chrome.runtime.onStartup.addListener(async () => {
  await ensureDefaultPassword();
  await setGlobalLocked(false);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "privacy-spotlight-activity") {
    if (sender.tab?.active) recordActivity();
    return;
  }
  if (message?.type === "privacy-spotlight-get-lock-state") {
    sendResponse({ locked });
    return;
  }
  if (message?.type === "privacy-spotlight-unlock") {
    setGlobalLocked(false);
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME || locked) return;
  const settings = await getLockSettings();
  const elapsed = Date.now() - lastActivity;
  const timeout = settings.idleTimeout * 1000;
  if (elapsed < timeout) {
    await scheduleLock();
    return;
  }
  if (
    settings.enabled &&
    settings.autoLockEnabled &&
    timeout > 0 &&
    settings.passwordHash &&
    settings.passwordSalt
  ) {
    await setGlobalLocked(true);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.passwordHash?.newValue === "" || changes.passwordSalt?.newValue === "") {
    setGlobalLocked(false);
    return;
  }
  if (changes.autoLockEnabled?.newValue === false || changes.enabled?.newValue === false) {
    setGlobalLocked(false);
    return;
  }
  scheduleLock();
});

Promise.all([
  ensureDefaultPassword(),
  chrome.storage.session.get({ globalLocked: false, lastActivity: Date.now() })
]).then(([, state]) => {
  locked = state.globalLocked;
  lastActivity = state.lastActivity;
  scheduleLock();
});
