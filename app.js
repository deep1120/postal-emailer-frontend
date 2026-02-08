const BACKEND_URL = "https://postal-emailer-backend.postal-mailer.workers.dev";

const TOKEN_KEY = "postal_token";

const el = (id) => document.getElementById(id);

function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
}
function setToken(t) {
  try { localStorage.setItem(TOKEN_KEY, t); } catch {}
}
function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

function safeJson(obj) {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}

let DEBUG = false;

function mountShell() {
  const root = document.body;
  root.innerHTML = `
    <div class="container">
      <div class="header">
        <div class="brand">
          <h1>Postal Emailer</h1>
          <div class="sub">Backend: <span id="backendUrl"></span></div>
        </div>
        <div class="pill" id="authPill">
          <span class="dot" id="authDot"></span>
          <span id="authText">Checking session…</span>
        </div>
      </div>

      <div class="card" id="screen"></div>

      <div class="toast hidden" id="toast">
        <div>
          <div class="msg" id="toastMsg"></div>
          <div class="meta" id="toastMeta"></div>
        </div>
        <button class="btn ghost" id="toastHideBtn" type="button">Dismiss</button>
      </div>

      <div class="row" style="margin-top:12px;">
        <button class="btn ghost" id="debugToggleBtn" type="button">Show debug</button>
      </div>

      <div class="debug hidden" id="debugBox">
        <pre id="debugPre"></pre>
      </div>
    </div>
  `;

  el("backendUrl").textContent = BACKEND_URL;

  el("toastHideBtn").addEventListener("click", () => hideToast());
  el("debugToggleBtn").addEventListener("click", () => {
    DEBUG = !DEBUG;
    el("debugBox").classList.toggle("hidden", !DEBUG);
    el("debugToggleBtn").textContent = DEBUG ? "Hide debug" : "Show debug";
  });
}

function showToast(kind, message, meta = "") {
  const toast = el("toast");
  toast.classList.remove("hidden", "ok", "err", "warn");
  if (kind === "ok") toast.classList.add("ok");
  else if (kind === "warn") toast.classList.add("warn");
  else toast.classList.add("err");

  el("toastMsg").textContent = message || "";
  el("toastMeta").textContent = meta || "";
}
function hideToast() {
  el("toast").classList.add("hidden");
}

function setAuthPill(authenticated, label) {
  const dot = el("authDot");
  const txt = el("authText");
  dot.classList.remove("ok", "warn");
  if (authenticated === true) dot.classList.add("ok");
  else if (authenticated === false) dot.classList.add("warn");
  txt.textContent = label || "";
}

function setDebug(obj) {
  if (!DEBUG) return;
  el("debugPre").textContent = safeJson(obj);
}

async function api(path, opts = {}) {
  const url = `${BACKEND_URL}${path}`;
  const headers = {
    "content-type": "application/json",
    ...(opts.headers || {}),
  };

  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, {
    ...opts,
    credentials: "include",
    headers,
  });

  const ct = res.headers.get("content-type") || "";
  let body;
  if (ct.includes("application/json")) body = await res.json().catch(() => null);
  else body = await res.text().catch(() => "");

  return { ok: res.ok, status: res.status, body };
}

// ---------- UI screens ----------

function renderLoggedOut() {
  const screen = el("screen");
  screen.innerHTML = `
    <div class="row" style="margin-bottom:10px;">
      <div class="badge">
        <span>Sign in to load customers</span>
      </div>
      <button class="btn ghost" id="checkMeBtn" type="button">Check session</button>
    </div>

    <div class="grid">
      <div>
        <div class="label">Username</div>
        <input id="username" autocomplete="username" />
      </div>
      <div>
        <div class="label">Password</div>
        <input id="password" type="password" autocomplete="current-password" />
      </div>
    </div>

    <div class="row" style="margin-top:14px;">
      <button class="btn primary" id="loginBtn" type="button">Log in</button>
      <div class="note">Tip: you can use Incognito — token auth is stored locally.</div>
    </div>
  `;

  el("checkMeBtn").addEventListener("click", async () => {
    const me = await api("/api/me", { method: "GET" });
    setDebug({ me });
    if (me.ok && me.body?.authenticated) {
      showToast("ok", "Already authenticated", `user=${me.body?.user?.sub || ""}`);
      await renderLoggedIn(me.body.user);
    } else {
      showToast("warn", "Not authenticated", "Please log in.");
    }
  });

  el("loginBtn").addEventListener("click", async () => {
    const username = (el("username").value || "").trim();
    const password = el("password").value || "";

    if (!username || !password) {
      showToast("warn", "Missing username or password");
      return;
    }

    showToast("warn", "Signing in…");
    const res = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });

    setDebug({ login: res });

    if (!res.ok) {
      showToast("err", "Login failed", safeJson(res.body));
      setAuthPill(false, "Not signed in");
      return;
    }

    if (res.body?.token) setToken(res.body.token);

    const me = await api("/api/me", { method: "GET" });
    setDebug({ login: res, me });

    if (me.ok && me.body?.authenticated) {
      showToast("ok", "Logged in", `user=${me.body?.user?.sub || ""}`);
      await renderLoggedIn(me.body.user);
    } else {
      showToast("err", "Login succeeded but session check failed", safeJson(me.body));
    }
  });
}

async function renderLoggedIn(user) {
  setAuthPill(true, `Signed in as ${user?.name || user?.sub || "user"}`);

  const screen = el("screen");
  screen.innerHTML = `
    <div class="row" style="margin-bottom:12px;">
      <div class="badge">
        <span>✅ Logged in as <strong>${escapeHtml(user?.name || user?.sub || "")}</strong></span>
        <span style="color:var(--muted)">(${escapeHtml(user?.sub || "")})</span>
      </div>
      <div class="row" style="gap:10px;">
        <button class="btn ghost" id="refreshBtnTop" type="button">Refresh</button>
        <button class="btn danger" id="logoutBtn" type="button">Log out</button>
      </div>
    </div>

    <div class="note">Choose MAIL or PACKAGE for each row. PACKAGE requires an origin.</div>

    <div class="tableWrap">
      <table class="tbl">
        <thead>
          <tr>
            <th>Box#</th>
            <th>Name</th>
            <th>Email</th>
            <th>Type</th>
            <th>Origin (if package)</th>
          </tr>
        </thead>
        <tbody id="tbody"></tbody>
      </table>
    </div>

    <div class="row" style="margin-top:14px;">
      <button class="btn primary" id="sendBtn" type="button">Send All (log only)</button>
      <button class="btn" id="meBtn" type="button">Check /api/me</button>
    </div>

    <div class="note">This version does NOT send emails yet — it logs selections on the backend.</div>
  `;

  el("logoutBtn").addEventListener("click", async () => {
    clearToken();
    setAuthPill(false, "Signed out");
    showToast("ok", "Logged out");
    renderLoggedOut();
  });

  el("refreshBtnTop").addEventListener("click", async () => {
    await loadAndRenderTable();
  });

  el("meBtn").addEventListener("click", async () => {
    const me = await api("/api/me", { method: "GET" });
    setDebug({ me });
    if (me.ok && me.body?.authenticated) {
      showToast("ok", "Session active", `exp=${me.body?.user?.exp || ""}`);
    } else {
      showToast("warn", "Session not active", safeJson(me.body));
    }
  });

  await loadAndRenderTable();
}

async function loadAndRenderTable() {
  showToast("warn", "Loading customers…");

  const [cust, org] = await Promise.all([
    api("/api/customers", { method: "GET" }),
    api("/api/origins", { method: "GET" }),
  ]);

  setDebug({ customers: cust, origins: org });

  if (!cust.ok) {
    showToast("err", "Failed to load customers", safeJson(cust.body));
    return;
  }
  if (!org.ok) {
    showToast("err", "Failed to load origins", safeJson(org.body));
    return;
  }

  const customers = cust.body?.customers || [];
  const origins = org.body?.origins || [];
  const tbody = el("tbody");

  // draft selections
  const draft = new Map(); // customerId -> { type, origin }

  tbody.innerHTML = "";

  for (const c of customers) {
    const tr = document.createElement("tr");

    const tdBox = document.createElement("td");
    tdBox.textContent = c.boxNumber || "";
    tr.appendChild(tdBox);

    const tdName = document.createElement("td");
    tdName.textContent = c.name || "";
    tr.appendChild(tdName);

    const tdEmail = document.createElement("td");
    tdEmail.textContent = c.email || "";
    tr.appendChild(tdEmail);

    const tdType = document.createElement("td");
    const selType = document.createElement("select");
    for (const t of ["none", "mail", "package"]) {
      const o = document.createElement("option");
      o.value = t;
      o.textContent = t === "none" ? "—" : t.toUpperCase();
      selType.appendChild(o);
    }
    tdType.appendChild(selType);
    tr.appendChild(tdType);

    const tdOrigin = document.createElement("td");
    const selOrigin = document.createElement("select");
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "—";
    selOrigin.appendChild(empty);

    for (const org of origins) {
      const o = document.createElement("option");
      o.value = org;
      o.textContent = org;
      selOrigin.appendChild(o);
    }
    selOrigin.disabled = true;
    tdOrigin.appendChild(selOrigin);
    tr.appendChild(tdOrigin);

    // Default
    draft.set(c.customerId, { type: "none", origin: "" });

    selType.addEventListener("change", () => {
      const cur = draft.get(c.customerId) || { type: "none", origin: "" };
      cur.type = selType.value;

      if (cur.type === "package") {
        selOrigin.disabled = false;
      } else {
        selOrigin.value = "";
        selOrigin.disabled = true;
        cur.origin = "";
      }
      draft.set(c.customerId, cur);
    });

    selOrigin.addEventListener("change", () => {
      const cur = draft.get(c.customerId) || { type: "none", origin: "" };
      cur.origin = selOrigin.value;
      draft.set(c.customerId, cur);
    });

    tbody.appendChild(tr);
  }

  el("sendBtn").onclick = async () => {
    const items = [];
    for (const c of customers) {
      const d = draft.get(c.customerId) || { type: "none", origin: "" };
      if (d.type === "none") continue;

      // client-side guard
      if (d.type === "package" && !d.origin) {
        showToast("warn", `Missing origin for package`, `box=${c.boxNumber || ""}`);
        return;
      }

      items.push({
        customerId: c.customerId,
        boxNumber: c.boxNumber,
        name: c.name,
        email: c.email,
        type: d.type,
        origin: d.origin || "",
      });
    }

    if (items.length === 0) {
      showToast("warn", "Nothing selected", "Choose MAIL or PACKAGE for at least one row.");
      return;
    }

    showToast("warn", "Sending (log only)…", `count=${items.length}`);
    const res = await api("/api/send-bulk", {
      method: "POST",
      body: JSON.stringify({ items }),
    });

    setDebug({ sendBulk: res });

    if (!res.ok) {
      showToast("err", "Send failed", safeJson(res.body));
      return;
    }

    showToast("ok", "Logged selections", `count=${items.length}`);
  };

  showToast("ok", "Loaded customers", `count=${customers.length}`);
}

// ---------- helpers ----------

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ---------- boot ----------

async function boot() {
  mountShell();

  setAuthPill(null, "Checking session…");

  // If token exists, validate session then show correct screen
  const token = getToken();
  const me = await api("/api/me", { method: "GET" });
  setDebug({ me });

  if (token && me.ok && me.body?.authenticated) {
    setAuthPill(true, `Signed in as ${me.body?.user?.name || me.body?.user?.sub || "user"}`);
    await renderLoggedIn(me.body.user);
  } else {
    setAuthPill(false, "Not signed in");
    renderLoggedOut();
  }
}

boot().catch((e) => {
  setAuthPill(false, "Error");
  showToast("err", "App error", e?.message || String(e));
});
