const DEFAULTS = {
  enabled: true,
  requireAlt: false,
  spotlightModeEnabled: false,
  awayBlurEnabled: true,
  autoLockEnabled: true,
  blurRadius: 10,
  spotlightRadius: 110,
  textContrast: 85,
  idleTimeout: 300
};

const form = document.querySelector("#settings");
const status = document.querySelector("#status");
let statusTimer;

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function createPasswordHash(password, salt) {
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

function displayValue(name, value) {
  const units = {
    blurRadius: "px",
    spotlightRadius: "px",
    textContrast: "%",
    idleTimeout: " giây"
  };
  const output = document.querySelector(`output[data-for="${name}"]`);
  if (output) output.textContent = `${value}${units[name] || ""}`;
}

function populate(values) {
  for (const [name, fallback] of Object.entries(DEFAULTS)) {
    const input = form.elements[name];
    const value = values[name] ?? fallback;
    if (input.getAttribute("role") === "switch") input.setAttribute("aria-checked", String(Boolean(value)));
    else if (input.type === "checkbox") input.checked = value;
    else input.value = value;
    displayValue(name, value);
  }
}

function readForm() {
  const values = {};
  for (const [name] of Object.entries(DEFAULTS)) {
    const input = form.elements[name];
    if (input.getAttribute("role") === "switch") {
      values[name] = input.getAttribute("aria-checked") === "true";
    } else {
      values[name] = input.type === "checkbox" ? input.checked : Number(input.value);
    }
  }
  return values;
}

function showSaved() {
  clearTimeout(statusTimer);
  status.textContent = "Đã lưu";
  statusTimer = setTimeout(() => (status.textContent = ""), 1200);
}

form.addEventListener("input", (event) => {
  if (event.target.matches("#new-password")) return;
  const values = readForm();
  for (const [name, value] of Object.entries(values)) displayValue(name, value);
  chrome.storage.sync.set(values, showSaved);
});

form.addEventListener("click", (event) => {
  const control = event.target.closest('[role="switch"]');
  if (!control) return;
  const checked = control.getAttribute("aria-checked") === "true";
  control.setAttribute("aria-checked", String(!checked));
  control.dispatchEvent(new Event("input", { bubbles: true }));
});

document.querySelector("#reset").addEventListener("click", () => {
  populate(DEFAULTS);
  chrome.storage.sync.set(DEFAULTS, showSaved);
});

chrome.storage.sync.get(DEFAULTS, populate);

const passwordState = document.querySelector("#password-state");
const passwordMessage = document.querySelector("#password-message");
const newPassword = document.querySelector("#new-password");

function refreshPasswordState() {
  chrome.storage.sync.get({ passwordHash: "", passwordSalt: "" }, ({ passwordHash, passwordSalt }) => {
    const configured = Boolean(passwordHash && passwordSalt);
    passwordState.dataset.configured = String(configured);
    passwordState.textContent = configured ? "Đã đặt mật khẩu" : "Chưa đặt mật khẩu";
  });
}

document.querySelector("#save-password").addEventListener("click", async () => {
  passwordMessage.textContent = "";
  if (Array.from(newPassword.value).length < 4) {
    passwordMessage.textContent = "Mật khẩu phải có ít nhất 4 ký tự.";
    return;
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const passwordHash = await createPasswordHash(newPassword.value, salt);
  await chrome.storage.sync.set({
    passwordHash,
    passwordSalt: bytesToBase64(salt),
    passwordLength: Array.from(newPassword.value).length
  });
  newPassword.value = "";
  passwordMessage.textContent = "Đã lưu mật khẩu.";
  refreshPasswordState();
});

refreshPasswordState();
