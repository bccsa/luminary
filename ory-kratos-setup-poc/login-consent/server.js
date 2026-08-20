import { createServer } from "node:http";

const HYDRA_ADMIN_URL = process.env.HYDRA_ADMIN_URL || "http://hydra:4445";
const KRATOS_PUBLIC_URL = process.env.KRATOS_PUBLIC_URL || "http://kratos:4433";
const KRATOS_ADMIN_URL = process.env.KRATOS_ADMIN_URL || "http://kratos:4434";
const PORT = process.env.PORT || 4456;
const REMEMBER_FOR_SECONDS = 3600;

function loginFormHtml(challenge, error) {
  return `<!doctype html>
<html><body style="font-family: sans-serif; max-width: 360px; margin: 80px auto;">
<h2>Sign in to Luminary</h2>
${error ? `<p style="color:red;">${error}</p>` : ""}
<form method="POST" action="/login?login_challenge=${encodeURIComponent(challenge)}">
  <div><label>Email<br><input type="email" name="email" required autofocus></label></div>
  <div style="margin-top:8px;"><label>Password<br><input type="password" name="password" required></label></div>
  <button type="submit" style="margin-top:12px;">Sign in</button>
</form>
<p style="margin-top:16px;">New here? <a href="/register?login_challenge=${encodeURIComponent(challenge)}">Sign up</a></p>
</body></html>`;
}

function registerFormHtml(challenge, error) {
  return `<!doctype html>
<html><body style="font-family: sans-serif; max-width: 360px; margin: 80px auto;">
<h2>Sign up for Luminary</h2>
${error ? `<p style="color:red;">${error}</p>` : ""}
<form method="POST" action="/register?login_challenge=${encodeURIComponent(challenge)}">
  <div><label>Email<br><input type="email" name="email" required autofocus></label></div>
  <div style="margin-top:8px;"><label>Password<br><input type="password" name="password" required minlength="8"></label></div>
  <button type="submit" style="margin-top:12px;">Sign up</button>
</form>
<p style="margin-top:16px;">Already have an account? <a href="/login?login_challenge=${encodeURIComponent(challenge)}">Sign in</a></p>
</body></html>`;
}

async function readFormBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const params = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  return Object.fromEntries(params);
}

async function hydraFetch(path, options) {
  const res = await fetch(`${HYDRA_ADMIN_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Hydra ${path} -> ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

async function handleLoginGet(url, res) {
  const challenge = url.searchParams.get("login_challenge");
  if (!challenge) return badRequest(res, "missing login_challenge");

  const loginRequest = await hydraFetch(
    `/admin/oauth2/auth/requests/login?login_challenge=${encodeURIComponent(challenge)}`,
  );

  if (loginRequest.skip) {
    const accept = await hydraFetch(
      `/admin/oauth2/auth/requests/login/accept?login_challenge=${encodeURIComponent(challenge)}`,
      { method: "PUT", body: JSON.stringify({ subject: loginRequest.subject }) },
    );
    return redirect(res, accept.redirect_to);
  }

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(loginFormHtml(challenge));
}

async function acceptLoginAndRedirect(res, challenge, identityId) {
  const accept = await hydraFetch(
    `/admin/oauth2/auth/requests/login/accept?login_challenge=${encodeURIComponent(challenge)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        subject: identityId,
        remember: true,
        remember_for: REMEMBER_FOR_SECONDS,
      }),
    },
  );
  redirect(res, accept.redirect_to);
}

async function handleLoginPost(req, url, res) {
  const challenge = url.searchParams.get("login_challenge");
  if (!challenge) return badRequest(res, "missing login_challenge");

  const { email, password } = await readFormBody(req);

  const flow = await (await fetch(`${KRATOS_PUBLIC_URL}/self-service/login/api`)).json();
  const submit = await fetch(`${KRATOS_PUBLIC_URL}/self-service/login?flow=${flow.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ method: "password", identifier: email, password }),
  });

  if (!submit.ok) {
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(loginFormHtml(challenge, "Invalid email or password."));
  }

  const { session } = await submit.json();
  await acceptLoginAndRedirect(res, challenge, session.identity.id);
}

async function handleRegisterGet(url, res) {
  const challenge = url.searchParams.get("login_challenge");
  if (!challenge) return badRequest(res, "missing login_challenge");
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(registerFormHtml(challenge));
}

async function handleRegisterPost(req, url, res) {
  const challenge = url.searchParams.get("login_challenge");
  if (!challenge) return badRequest(res, "missing login_challenge");

  const { email, password } = await readFormBody(req);

  const flow = await (await fetch(`${KRATOS_PUBLIC_URL}/self-service/registration/api`)).json();
  const submit = await fetch(`${KRATOS_PUBLIC_URL}/self-service/registration?flow=${flow.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ method: "password", password, traits: { email } }),
  });

  if (!submit.ok) {
    const body = await submit.json().catch(() => null);
    const message = body?.ui?.messages?.[0]?.text || "Could not create account. Try a different email or a stronger password.";
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(registerFormHtml(challenge, message));
  }

  const { identity } = await submit.json();
  await acceptLoginAndRedirect(res, challenge, identity.id);
}

async function handleConsentGet(url, res) {
  const challenge = url.searchParams.get("consent_challenge");
  if (!challenge) return badRequest(res, "missing consent_challenge");

  const consentRequest = await hydraFetch(
    `/admin/oauth2/auth/requests/consent?consent_challenge=${encodeURIComponent(challenge)}`,
  );

  const identity = await (
    await fetch(`${KRATOS_ADMIN_URL}/admin/identities/${consentRequest.subject}`)
  ).json();

  const claims = {
    email: identity.traits?.email,
    name: identity.traits?.name,
  };

  const accept = await hydraFetch(
    `/admin/oauth2/auth/requests/consent/accept?consent_challenge=${encodeURIComponent(challenge)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        grant_scope: consentRequest.requested_scope,
        grant_access_token_audience: consentRequest.requested_access_token_audience,
        remember: true,
        remember_for: REMEMBER_FOR_SECONDS,
        session: {
          // Luminary's AuthGuard verifies the bearer ACCESS token, not the ID token,
          // so identity claims have to land on both or the API never sees them.
          access_token: claims,
          id_token: claims,
        },
      }),
    },
  );
  redirect(res, accept.redirect_to);
}

async function handleLogoutGet(url, res) {
  const challenge = url.searchParams.get("logout_challenge");
  if (!challenge) return badRequest(res, "missing logout_challenge");

  const accept = await hydraFetch(
    `/admin/oauth2/auth/requests/logout/accept?logout_challenge=${encodeURIComponent(challenge)}`,
    { method: "PUT", body: JSON.stringify({}) },
  );
  redirect(res, accept.redirect_to);
}

function badRequest(res, message) {
  res.writeHead(400, { "Content-Type": "text/plain" });
  res.end(message);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === "/login" && req.method === "GET") return await handleLoginGet(url, res);
    if (url.pathname === "/login" && req.method === "POST") return await handleLoginPost(req, url, res);
    if (url.pathname === "/register" && req.method === "GET") return await handleRegisterGet(url, res);
    if (url.pathname === "/register" && req.method === "POST") return await handleRegisterPost(req, url, res);
    if (url.pathname === "/consent" && req.method === "GET") return await handleConsentGet(url, res);
    if (url.pathname === "/logout" && req.method === "GET") return await handleLogoutGet(url, res);
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(`internal error: ${err.message}`);
  }
});

server.listen(PORT, () => console.log(`login-consent bridge listening on :${PORT}`));
