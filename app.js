const BACKEND = "https://postal-emailer-backend.postal-mailer.workers.dev";
document.getElementById("backendUrl").textContent = BACKEND;

const statusEl = document.getElementById("status");
const usernameEl = document.getElementById("username");
const passwordEl = document.getElementById("password");

function setStatus(msg) {
  statusEl.textContent = typeof msg === "string" ? msg : JSON.stringify(msg, null, 2);
}

async function api(path, options = {}) {
  const res = await fetch(`${BACKEND}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}

document.getElementById("loginBtn").addEventListener("click", async () => {
  setStatus("Logging in...");
  const username = usernameEl.value.trim();
  const password = passwordEl.value;

  const r = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

  setStatus(r);
});

document.getElementById("meBtn").addEventListener("click", async () => {
  setStatus("Checking session...");
  const r = await api("/api/me", { method: "GET" });
  setStatus(r);
});

// Auto-check on load
(async () => {
  const r = await api("/api/me", { method: "GET" });
  setStatus(r);
})();
