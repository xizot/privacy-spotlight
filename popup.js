const enabled = document.querySelector("#enabled");
const siteLabel = document.querySelector("#site");
let siteKey;

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  try {
    const url = new URL(tab.url);
    if (!/^https?:$/.test(url.protocol)) throw new Error("unsupported");
    siteKey = url.origin;
    siteLabel.textContent = url.hostname;
    chrome.storage.sync.get({ sites: {} }, ({ sites }) => {
      enabled.setAttribute("aria-checked", String(sites[siteKey]?.enabled === true));
      enabled.disabled = false;
    });
  } catch {
    siteLabel.textContent = "";
  }
});

enabled.addEventListener("click", () => {
  if (!siteKey) return;
  const nextEnabled = enabled.getAttribute("aria-checked") !== "true";
  enabled.setAttribute("aria-checked", String(nextEnabled));
  enabled.disabled = true;
  chrome.storage.sync.get({ sites: {} }, ({ sites }) => {
    chrome.storage.sync.set({
      sites: {
        ...sites,
        [siteKey]: { ...sites[siteKey], enabled: nextEnabled }
      }
    }, () => {
      window.close();
    });
  });
});
document.querySelector("#options").addEventListener("click", () => chrome.runtime.openOptionsPage());
