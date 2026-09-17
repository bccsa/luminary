import { createServer } from "node:http";

const KRATOS_ADMIN_URL = process.env.KRATOS_ADMIN_URL || "http://kratos:4434";
const HYDRA_ADMIN_URL = process.env.HYDRA_ADMIN_URL || "http://hydra:4445";
const PORT = process.env.PORT || 4457;

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

async function adminFetch(base, path, options) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${base}${path} -> ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

const kratos = (path, options) => adminFetch(KRATOS_ADMIN_URL, path, options);
const hydra = (path, options) => adminFetch(HYDRA_ADMIN_URL, path, options);

function layout(title, active, body, flash) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)} — Ory admin</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 960px; margin: 0 auto; padding: 32px 24px 64px; color: #1a1a1a; background: #fafafa; }
  @media (prefers-color-scheme: dark) { body { color: #e4e4e4; background: #16171a; } }
  h1 { font-size: 1.4rem; margin: 0 0 4px; }
  .sub { color: #777; font-size: 0.9rem; margin: 0 0 24px; }
  nav { display: flex; gap: 4px; margin-bottom: 24px; border-bottom: 1px solid #ddd; }
  @media (prefers-color-scheme: dark) { nav { border-color: #333; } }
  nav a { padding: 8px 14px; text-decoration: none; color: inherit; border-bottom: 2px solid transparent; font-size: 0.9rem; }
  nav a.active { border-color: #4f46e5; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 0.88rem; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 0 0 1px #e5e5e5; }
  @media (prefers-color-scheme: dark) { table { background: #1f2023; box-shadow: 0 0 0 1px #333; } }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #eee; vertical-align: top; }
  @media (prefers-color-scheme: dark) { th, td { border-color: #2a2b2e; } }
  tr:last-child td { border-bottom: none; }
  th { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; color: #888; }
  .id { font-family: ui-monospace, monospace; font-size: 0.8rem; color: #666; }
  form.inline { display: inline; }
  button.action { font-size: 0.78rem; padding: 4px 8px; border: 1px solid #ccc; background: white; border-radius: 5px; cursor: pointer; color: inherit; margin-right: 4px; }
  @media (prefers-color-scheme: dark) { button.action { background: #2a2b2e; border-color: #444; } }
  button.action:hover { border-color: #999; }
  button.danger { color: #b91c1c; border-color: #f3c2c2; }
  .flash { padding: 10px 14px; border-radius: 6px; margin-bottom: 20px; font-size: 0.88rem; }
  .flash.ok { background: #e7f7ee; color: #16653d; }
  .flash.error { background: #fdecec; color: #92140c; }
  input[type=search] { padding: 6px 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 0.88rem; width: 260px; }
  .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .empty { padding: 24px; text-align: center; color: #888; font-size: 0.88rem; }
</style>
</head>
<body>
<h1>Ory admin</h1>
<p class="sub">Local dev tooling for the Kratos + Hydra guest-auth PoC.</p>
<nav>
  <a href="/identities" class="${active === "identities" ? "active" : ""}">Identities</a>
  <a href="/clients" class="${active === "clients" ? "active" : ""}">OAuth clients</a>
</nav>
${flash ? `<div class="flash ${flash.type}">${escapeHtml(flash.text)}</div>` : ""}
${body}
</body>
</html>`;
}

function flashFromQuery(url) {
  const msg = url.searchParams.get("msg");
  if (!msg) return null;
  return { text: msg, type: url.searchParams.get("err") ? "error" : "ok" };
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function matchesQuery(haystackParts, q) {
  if (!q) return true;
  return haystackParts.join(" ").toLowerCase().includes(q);
}

async function handleIdentitiesGet(url, res) {
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const identities = await kratos("/admin/identities?page_size=250");

  const rows = identities
    .filter((identity) => matchesQuery([identity.id, identity.traits?.email, identity.traits?.name], q))
    .map(
      (identity) => `
      <tr>
        <td class="id">${escapeHtml(identity.id)}</td>
        <td>${escapeHtml(identity.traits?.email || "—")}</td>
        <td>${escapeHtml(identity.traits?.name || "—")}</td>
        <td>${escapeHtml(identity.state)}</td>
        <td>${escapeHtml(new Date(identity.created_at).toLocaleString())}</td>
        <td>
          <form class="inline" method="POST" action="/identities/${encodeURIComponent(identity.id)}/revoke-sessions">
            <button class="action" type="submit">Revoke sessions</button>
          </form>
          <form class="inline" method="POST" action="/identities/${encodeURIComponent(identity.id)}/delete" onsubmit="return confirm('Delete this identity? This cannot be undone.');">
            <button class="action danger" type="submit">Delete</button>
          </form>
        </td>
      </tr>`,
    )
    .join("");

  const body = `
    <div class="toolbar">
      <form method="GET" action="/identities">
        <input type="search" name="q" placeholder="Search id, email, name" value="${escapeHtml(q)}">
      </form>
      <span class="sub" style="margin:0;">${identities.length} identit${identities.length === 1 ? "y" : "ies"}</span>
    </div>
    ${
      rows
        ? `<table>
          <thead><tr><th>ID</th><th>Email</th><th>Name</th><th>State</th><th>Created</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`
        : `<div class="empty">No identities match.</div>`
    }
  `;

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(layout("Identities", "identities", body, flashFromQuery(url)));
}

async function handleIdentityDelete(id, res) {
  await kratos(`/admin/identities/${encodeURIComponent(id)}`, { method: "DELETE" });
  redirect(res, `/identities?msg=${encodeURIComponent("Identity deleted.")}`);
}

async function handleIdentityRevokeSessions(id, res) {
  await kratos(`/admin/identities/${encodeURIComponent(id)}/sessions`, { method: "DELETE" });
  // Kratos owns the login session; the Hydra grant survives it, so both have to be revoked to force a fresh consent.
  await Promise.allSettled([
    hydra(`/admin/oauth2/auth/sessions/consent?subject=${encodeURIComponent(id)}&all=true`, { method: "DELETE" }),
    hydra(`/admin/oauth2/auth/sessions/login?subject=${encodeURIComponent(id)}`, { method: "DELETE" }),
  ]);
  redirect(res, `/identities?msg=${encodeURIComponent("Kratos and Hydra sessions revoked.")}`);
}

async function handleClientsGet(url, res) {
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const clients = await hydra("/admin/clients?page_size=250");

  const rows = clients
    .filter((client) => matchesQuery([client.client_id, client.client_name], q))
    .map(
      (client) => `
      <tr>
        <td class="id">${escapeHtml(client.client_id)}</td>
        <td>${escapeHtml(client.client_name || "—")}</td>
        <td>${escapeHtml((client.grant_types || []).join(", "))}</td>
        <td>${escapeHtml(client.scope || "—")}</td>
        <td>
          <form class="inline" method="POST" action="/clients/${encodeURIComponent(client.client_id)}/delete" onsubmit="return confirm('Delete this OAuth2 client? This cannot be undone.');">
            <button class="action danger" type="submit">Delete</button>
          </form>
        </td>
      </tr>`,
    )
    .join("");

  const body = `
    <div class="toolbar">
      <form method="GET" action="/clients">
        <input type="search" name="q" placeholder="Search id, name" value="${escapeHtml(q)}">
      </form>
      <span class="sub" style="margin:0;">${clients.length} client${clients.length === 1 ? "" : "s"}</span>
    </div>
    ${
      rows
        ? `<table>
          <thead><tr><th>Client ID</th><th>Name</th><th>Grant types</th><th>Scope</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`
        : `<div class="empty">No clients match.</div>`
    }
  `;

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(layout("OAuth clients", "clients", body, flashFromQuery(url)));
}

async function handleClientDelete(id, res) {
  await hydra(`/admin/clients/${encodeURIComponent(id)}`, { method: "DELETE" });
  redirect(res, `/clients?msg=${encodeURIComponent("Client deleted.")}`);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if ((url.pathname === "/" || url.pathname === "") && req.method === "GET") return redirect(res, "/identities");
    if (url.pathname === "/identities" && req.method === "GET") return await handleIdentitiesGet(url, res);
    if (url.pathname === "/clients" && req.method === "GET") return await handleClientsGet(url, res);

    const deleteIdentityMatch = url.pathname.match(/^\/identities\/([^/]+)\/delete$/);
    if (deleteIdentityMatch && req.method === "POST")
      return await handleIdentityDelete(decodeURIComponent(deleteIdentityMatch[1]), res);

    const revokeMatch = url.pathname.match(/^\/identities\/([^/]+)\/revoke-sessions$/);
    if (revokeMatch && req.method === "POST")
      return await handleIdentityRevokeSessions(decodeURIComponent(revokeMatch[1]), res);

    const deleteClientMatch = url.pathname.match(/^\/clients\/([^/]+)\/delete$/);
    if (deleteClientMatch && req.method === "POST")
      return await handleClientDelete(decodeURIComponent(deleteClientMatch[1]), res);

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  } catch (err) {
    console.error(err);
    // GET failures render inline; redirecting a failed GET back to itself would loop.
    if (req.method !== "GET") {
      const backTo = url.pathname.startsWith("/clients") ? "/clients" : "/identities";
      return redirect(res, `${backTo}?err=1&msg=${encodeURIComponent(err.message)}`);
    }
    res.writeHead(502, { "Content-Type": "text/html" });
    res.end(layout("Error", null, `<div class="flash error">${escapeHtml(err.message)}</div>`, null));
  }
});

server.listen(PORT, () => console.log(`ory admin listening on :${PORT}`));
