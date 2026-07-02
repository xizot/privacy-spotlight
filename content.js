(() => {
  const DEFAULTS = {
    enabled: true,
    requireAlt: false,
    spotlightModeEnabled: false,
    awayBlurEnabled: true,
    autoLockEnabled: true,
    protectSidebar: true,
    protectChat: true,
    protectMedia: true,
    blurRadius: 10,
    spotlightRadius: 110,
    textContrast: 85,
    idleTimeout: 300,
    lockOnBlur: true,
    passwordHash: "",
    passwordSalt: "",
    sites: {}
  };

  const root = document.documentElement;
  const siteKey = location.origin;
  const isZalo = location.hostname === "chat.zalo.me";
  let settings = { ...DEFAULTS };
  let altPressed = false;
  let lockScreen;
  let lockInput;
  let lastActivityReport = 0;
  let globalLocked = false;
  let pointerInsidePage = true;
  let awayOverlay;

  function setFlag(name, value) {
    root.toggleAttribute(`data-zcp-${name}`, Boolean(value));
  }

  function applySettings(next) {
    settings = { ...DEFAULTS, ...next };
    const siteEnabled = settings.sites?.[siteKey]?.enabled === true;
    const active = settings.enabled && siteEnabled;
    const spotlightActive = active && settings.spotlightModeEnabled;
    root.style.setProperty("--zcp-blur", `${settings.blurRadius}px`);
    root.style.setProperty("--zcp-spotlight-radius", `${settings.spotlightRadius}px`);
    root.style.setProperty("--zcp-text-contrast", `${settings.textContrast}%`);

    setFlag("enabled", active);
    setFlag("sidebar", spotlightActive && isZalo);
    setFlag("chat", spotlightActive);
    setFlag("media", spotlightActive && isZalo);
    setFlag("spotlight", spotlightActive);
    setFlag("away-enabled", active && settings.awayBlurEnabled);
    setFlag("away", active && settings.awayBlurEnabled && !pointerInsidePage);
    mountAwayOverlay();
    setFlag("require-alt", settings.requireAlt);
    updateRevealState();
    mountLockScreen();
    setLocked(globalLocked);
    resetIdleTimer();
  }

  function updateRevealState() {
    const allowed = !settings.requireAlt || altPressed;
    const siteEnabled = settings.sites?.[siteKey]?.enabled === true;
    setFlag("reveal-allowed", settings.enabled && siteEnabled && allowed);
  }

  function mountAwayOverlay() {
    if (awayOverlay || !document.documentElement) return;
    awayOverlay = document.createElement("div");
    awayOverlay.id = "zcp-away-overlay";
    awayOverlay.setAttribute("aria-hidden", "true");
    document.documentElement.append(awayOverlay);
  }

  function setLocked(locked) {
    globalLocked = Boolean(locked);
    const siteEnabled = settings.sites?.[siteKey]?.enabled === true;
    const canLock =
      settings.autoLockEnabled && Boolean(settings.passwordHash && settings.passwordSalt);
    windowLocked = settings.enabled && siteEnabled && canLock && globalLocked;
    setFlag("locked", windowLocked);
    renderLockState();
  }

  function resetIdleTimer() {
    if (windowLocked || document.visibilityState !== "visible") return;
    const now = Date.now();
    if (now - lastActivityReport < 500) return;
    lastActivityReport = now;
    chrome.runtime.sendMessage({ type: "privacy-spotlight-activity" });
  }

  let windowLocked = false;

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

  function mountLockScreen() {
    if (lockScreen || !document.documentElement) return;
    lockScreen = document.createElement("iframe");
    lockScreen.id = "zcp-lock-screen";
    lockScreen.src = chrome.runtime.getURL("lock.html");
    lockScreen.title = "Mở khóa";
    lockScreen.setAttribute("allow", "");
    lockScreen.addEventListener("load", () => {
      if (!windowLocked) return;
      lockScreen.focus();
      lockScreen.contentWindow?.postMessage({ type: "privacy-spotlight-focus" }, "*");
    });
    document.documentElement.append(lockScreen);
    return;

    lockScreen = document.createElement("div");
    lockScreen.id = "zcp-lock-screen";
    const shadow = lockScreen.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .backdrop { position: fixed; inset: 0; display: grid; place-items: center; background: rgba(10,14,12,.76); backdrop-filter: blur(22px); font-family: Inter,system-ui,sans-serif; color: #eef5f1; }
        form { width: min(360px,calc(100vw - 40px)); padding: 26px; border: 1px solid #34453d; border-radius: 18px; background: #151c19; box-shadow: 0 24px 80px rgba(0,0,0,.45); }
        .eyebrow { margin: 12px 0 7px; color: #55e49b; font-size: 11px; font-weight: 800; letter-spacing: .14em; }
        h2 { margin: 0 0 8px; font-size: 24px; }
        p { margin: 0 0 20px; color: #9daba4; font-size: 13px; }
        input { width: 100%; box-sizing: border-box; border: 1px solid #3a4a43; border-radius: 10px; padding: 12px; background: #0e1311; color: #fff; outline: none; }
        input:focus { border-color: #55e49b; }
        button { width: 100%; margin-top: 12px; border: 0; border-radius: 10px; padding: 12px; background: #55e49b; color: #092116; font-weight: 750; cursor: pointer; }
        .error { min-height: 18px; margin: 9px 0 0; color: #ff8c8c; font-size: 12px; }
      </style>
      <div class="backdrop">
        <form>
          <div class="eyebrow">PRIVACY SPOTLIGHT</div>
          <h2>Trang đã khóa</h2>
          <p>Nhập mật khẩu để hiển thị lại nội dung.</p>
          <input type="password" autocomplete="current-password" placeholder="Mật khẩu" required autofocus />
          <button type="submit">Mở khóa</button>
          <div class="error" role="alert"></div>
        </form>
      </div>`;
    const form = shadow.querySelector("form");
    const input = shadow.querySelector("input");
    lockInput = input;
    const error = shadow.querySelector(".error");
    for (const eventName of [
      "keydown",
      "keyup",
      "keypress",
      "pointerdown",
      "pointerup",
      "click",
      "input"
    ]) {
      shadow.addEventListener(eventName, (event) => event.stopPropagation());
    }
    shadow.addEventListener("keydown", (event) => {
      if (event.key === "Escape") event.preventDefault();
      if (event.key !== "Tab") return;
      const controls = [input, shadow.querySelector("button")];
      const current = controls.indexOf(shadow.activeElement);
      const next = event.shiftKey
        ? (current - 1 + controls.length) % controls.length
        : (current + 1) % controls.length;
      event.preventDefault();
      controls[next].focus();
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = shadow.querySelector("button");
      button.disabled = true;
      error.textContent = "";
      try {
        const actual = await hashPassword(input.value, base64ToBytes(settings.passwordSalt));
        if (actual !== settings.passwordHash) {
          error.textContent = "Mật khẩu không đúng.";
          input.select();
          return;
        }
        input.value = "";
        setLocked(false);
        resetIdleTimer();
      } catch {
        error.textContent = "Không thể xác thực mật khẩu.";
      } finally {
        button.disabled = false;
      }
    });
    document.documentElement.append(lockScreen);
  }

  function renderLockState() {
    if (!lockScreen) return;
    lockScreen.hidden = !windowLocked;
    if (document.body) document.body.inert = windowLocked;
    if (windowLocked) {
      requestAnimationFrame(() => {
        lockScreen.focus();
        lockScreen.contentWindow?.postMessage({ type: "privacy-spotlight-focus" }, "*");
      });
    }
  }

  function updatePointer(event) {
    pointerInsidePage = true;
    setFlag("away", false);
    root.style.setProperty("--zcp-pointer-x", `${event.clientX}px`);
    root.style.setProperty("--zcp-pointer-y", `${event.clientY}px`);
    resetIdleTimer();
  }

  chrome.storage.sync.get(DEFAULTS, applySettings);
  window.addEventListener("message", (event) => {
    if (
      event.source === lockScreen?.contentWindow &&
      event.data?.type === "privacy-spotlight-unlocked"
    ) {
      chrome.runtime.sendMessage({ type: "privacy-spotlight-unlock" });
    }
  });
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "privacy-spotlight-lock-state") setLocked(message.locked);
  });
  chrome.runtime.sendMessage({ type: "privacy-spotlight-get-lock-state" }, (response) => {
    if (!chrome.runtime.lastError) setLocked(response?.locked === true);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    const next = { ...settings };
    for (const [key, change] of Object.entries(changes)) next[key] = change.newValue;
    applySettings(next);
  });

  document.addEventListener("pointermove", updatePointer, { passive: true });
  document.documentElement.addEventListener("mouseleave", () => {
    pointerInsidePage = false;
    const siteEnabled = settings.sites?.[siteKey]?.enabled === true;
    setFlag("away", settings.enabled && siteEnabled && settings.awayBlurEnabled);
  });
  document.documentElement.addEventListener("mouseenter", () => {
    pointerInsidePage = true;
    setFlag("away", false);
    resetIdleTimer();
  });
  document.addEventListener("pointerdown", resetIdleTimer, { passive: true });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Alt") {
      altPressed = true;
      updateRevealState();
    }
    resetIdleTimer();
  });
  document.addEventListener("keyup", (event) => {
    if (event.key === "Alt") {
      altPressed = false;
      updateRevealState();
    }
  });
  window.addEventListener("blur", () => {
    altPressed = false;
    pointerInsidePage = false;
    const siteEnabled = settings.sites?.[siteKey]?.enabled === true;
    setFlag("away", settings.enabled && siteEnabled && settings.awayBlurEnabled);
    updateRevealState();
  });
  window.addEventListener("focus", () => {
    if (windowLocked) renderLockState();
    else resetIdleTimer();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pointerInsidePage = false;
      const siteEnabled = settings.sites?.[siteKey]?.enabled === true;
      setFlag("away", settings.enabled && siteEnabled && settings.awayBlurEnabled);
    } else {
      resetIdleTimer();
    }
  });

})();
