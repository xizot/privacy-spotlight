const otp = document.querySelector("#otp");
const legacyInput = document.querySelector("#legacy-password");
const error = document.querySelector(".error");
let inputs = [];
let checking = false;
let legacyMode = false;

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
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

async function verify(password) {
  if (checking) return;
  checking = true;
  error.textContent = "";
  try {
    const { passwordHash, passwordSalt } = await chrome.storage.sync.get({
      passwordHash: "",
      passwordSalt: ""
    });
    const actual = await hashPassword(password, base64ToBytes(passwordSalt));
    if (actual === passwordHash) {
      if (legacyMode) {
        await chrome.storage.sync.set({ passwordLength: Array.from(password).length });
        legacyMode = false;
      }
      clearInputs();
      window.parent.postMessage({ type: "privacy-spotlight-unlocked" }, "*");
      return;
    }
    if (legacyMode) {
      const previous = inputs.map((input) => input.value);
      buildOtp(inputs.length + 1, previous);
      inputs[inputs.length - 1].focus();
      return;
    }
    error.textContent = "Mật khẩu không đúng.";
    clearInputs();
    focusFirst();
  } catch {
    error.textContent = "Không thể xác thực mật khẩu.";
  } finally {
    checking = false;
  }
}

function clearInputs() {
  inputs.forEach((input) => (input.value = ""));
  legacyInput.value = "";
}

function focusFirst() {
  (inputs[0] || legacyInput).focus();
}

function focusAvailableInput() {
  const active = document.activeElement;
  if (inputs.includes(active) || active === legacyInput) return;
  const target = inputs.find((input) => !input.value) || inputs[0] || legacyInput;
  target.focus();
}

function maybeVerify() {
  if (!inputs.length || inputs.some((input) => !input.value)) return;
  verify(inputs.map((input) => input.value).join(""));
}

function fillFrom(index, characters) {
  for (let offset = 0; offset < characters.length && index + offset < inputs.length; offset += 1) {
    inputs[index + offset].value = characters[offset];
  }
  const next = Math.min(index + characters.length, inputs.length - 1);
  inputs[next].focus();
  maybeVerify();
}

function buildOtp(length, previous = []) {
  otp.replaceChildren();
  inputs = Array.from({ length }, (_, index) => {
    const input = document.createElement("input");
    input.type = "password";
    input.inputMode = "text";
    input.autocomplete = "off";
    if (index === 0) input.autofocus = true;
    input.setAttribute("aria-label", `Ký tự ${index + 1}`);
    input.value = previous[index] || "";
    input.addEventListener("input", () => {
      const characters = Array.from(input.value);
      input.value = "";
      if (characters.length) fillFrom(index, characters);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !input.value && index > 0) {
        inputs[index - 1].value = "";
        inputs[index - 1].focus();
      } else if (event.key === "ArrowLeft" && index > 0) {
        inputs[index - 1].focus();
      } else if (event.key === "ArrowRight" && index < inputs.length - 1) {
        inputs[index + 1].focus();
      }
    });
    input.addEventListener("paste", (event) => {
      event.preventDefault();
      fillFrom(index, Array.from(event.clipboardData.getData("text")));
    });
    otp.append(input);
    return input;
  });
}

async function initialize() {
  const { passwordLength } = await chrome.storage.sync.get({ passwordLength: 0 });
  if (passwordLength > 0) {
    legacyInput.hidden = true;
    otp.hidden = false;
    buildOtp(passwordLength);
  } else {
    legacyMode = true;
    legacyInput.hidden = true;
    otp.hidden = false;
    buildOtp(1);
  }
  focusFirst();
}

window.addEventListener("message", (event) => {
  if (event.data?.type !== "privacy-spotlight-focus") return;
  error.textContent = "";
  clearInputs();
  requestAnimationFrame(focusFirst);
});

window.addEventListener("focus", () => requestAnimationFrame(focusFirst));
document.addEventListener("click", () => requestAnimationFrame(focusAvailableInput));

initialize();
