const BACKEND_URL = "https://postal-emailer-backend.postal-mailer.workers.dev";

const el = (id) => document.getElementById(id);

function setStatus(obj) {
  el("status").textContent = JSON.stringify(obj, null, 2);
}

async function api(path, opts = {}) {
  const url = `${BACKEND_URL}${path}`;
  const res = await fetch(url, {
    ...opts,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(opts.headers || {})
    }
  });

  const ct = res.headers.get("content-type") || "";
  let body;
  if (ct.includes("application/json")) body = await res.json();
  else body = await res.text();

  return { ok: res.ok, status: res.status, body };
}

function renderApp(customers, origins) {
  const root = el("app");
  root.innerHTML = "";

  const card = document.createElement("div");
  card.className = "card";

  const top = document.createElement("div");
  top.className = "small";
  top.textContent = `Backend: ${BACKEND_URL} | Customers loaded: ${customers.length}`;
  card.appendChild(top);

  const table = document.createElement("table");
  table.className = "tbl";
  table.innerHTML = `
    <thead>
      <tr>
        <th style="width:90px;">Box#</th>
        <th>Name</th>
        <th>Email</th>
        <th style="width:130px;">Type</th>
        <th style="width:160px;">Origin (if package)</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");

  // Keep draft selections in memory
  const draft = new Map(); // customerId -> {type, origin}

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

      // origin only required for package
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

  const btnRow = document.createElement("div");
  btnRow.className = "row";

  const sendBtn = document.createElement("button");
  sendBtn.textContent = "Send All (log only)";
  sendBtn.id = "sendAllBtn";

  const refreshBtn = document.createElement("button");
  refreshBtn.textContent = "Refresh /api/me";

  btnRow.appendChild(sendBtn);
  btnRow.appendChild(refreshBtn);

  const note = document.createElement("div");
  note.className = "small";
  note.style.marginTop = "10px";
  note.textContent = "This version does NOT send emails yet — it logs selections on the backend.";

  card.appendChild(table);
  card.appendChild(btnRow);
  card.appendChild(note);

  root.appendChild(card);

  refreshBtn.addEventListener("click", async () => {
    const me = await api("/api/me", { method: "GET" });
    setStatus(me);
  });

  sendBtn.addEventListener("click", async () => {
    // Build payload of only rows that have mail/package selected
    const items = [];
    for (const c of customers) {
      const d = draft.get(c.customerId) || { type: "none", origin: "" };
      if (d.type === "none") continue;

      items.push({
        customerId: c.customerId,
        boxNumber: c.boxNumber,
        name: c.name,
        email: c.email,
        type: d.type,
        origin: d.origin || ""
      });
    }

    if (items.length === 0) {
      setStatus({ ok: false, message: "Nothing selected. Choose MAIL or PACKAGE for at least one row." });
      return;
    }

    const res = await api("/api/send-bulk", {
      method: "POST",
      body: JSON.stringify({ items })
    });

    setStatus(res);
  });
}

async function boot() {
  el("backendUrl").textContent = BACKEND_URL;

  // Wire login button
  el("loginBtn").addEventListener("click", async () => {
    const username = el("username").value.trim();
    const password = el("password").value;

    const res = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    setStatus(res);

    if (res.ok) {
      await loadAfterLogin();
    }
  });

  el("meBtn").addEventListener("click", async () => {
    const me = await api("/api/me", { method: "GET" });
    setStatus(me);
  });

  // Auto-check session
  const me = await api("/api/me", { method: "GET" });
  setStatus(me);
  if (me.ok && me.body && me.body.authenticated) {
    await loadAfterLogin();
  }
}

async function loadAfterLogin() {
  const [cust, org] = await Promise.all([
    api("/api/customers", { method: "GET" }),
    api("/api/origins", { method: "GET" })
  ]);

  if (!cust.ok) {
    setStatus({ ok: false, message: "Failed to load customers", details: cust });
    return;
  }
  if (!org.ok) {
    setStatus({ ok: false, message: "Failed to load origins", details: org });
    return;
  }

  renderApp(cust.body.customers || [], org.body.origins || []);
  setStatus({ ok: true, message: "Loaded customers + origins", customers: cust.body.count });
}

boot().catch((e) => setStatus({ ok: false, error: e?.message || String(e) }));
