// Pages the user actually sees. Kept apart from server.js so they can be
// rendered — and looked at — without Kratos, Hydra or a browser session.

/**
 * Everything interpolated into these pages is escaped. Error text reaches here
 * from Kratos' flow messages, which can carry values a user typed.
 */
export function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// The wordmark from the app, with the text set to currentColor so it survives
// dark mode. The amber mark is the brand colour and stays as it is.
const LOGO = `<svg class="logo" width="118" height="29" viewBox="0 0 157 39" fill="none"
     xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Luminary">
  <path d="M32.704 28.928H39.536V31H30.156V11.484H32.704V28.928ZM55.8499 15.656V31H53.3019V28.732C52.8166 29.516 52.1353 30.132 51.2579 30.58C50.3993 31.0093 49.4473 31.224 48.4019 31.224C47.2073 31.224 46.1339 30.9813 45.1819 30.496C44.2299 29.992 43.4739 29.2453 42.9139 28.256C42.3726 27.2667 42.1019 26.0627 42.1019 24.644V15.656H44.6219V24.308C44.6219 25.82 45.0046 26.9867 45.7699 27.808C46.5353 28.6107 47.5806 29.012 48.9059 29.012C50.2686 29.012 51.3419 28.592 52.1259 27.752C52.9099 26.912 53.3019 25.6893 53.3019 24.084V15.656H55.8499ZM78.6041 15.376C79.7988 15.376 80.8628 15.628 81.7961 16.132C82.7294 16.6173 83.4668 17.3547 84.0081 18.344C84.5494 19.3333 84.8201 20.5373 84.8201 21.956V31H82.3001V22.32C82.3001 20.7893 81.9174 19.6227 81.1521 18.82C80.4054 17.9987 79.3881 17.588 78.1001 17.588C76.7748 17.588 75.7201 18.0173 74.9361 18.876C74.1521 19.716 73.7601 20.9387 73.7601 22.544V31H71.2401V22.32C71.2401 20.7893 70.8574 19.6227 70.0921 18.82C69.3454 17.9987 68.3281 17.588 67.0401 17.588C65.7148 17.588 64.6601 18.0173 63.8761 18.876C63.0921 19.716 62.7001 20.9387 62.7001 22.544V31H60.1521V15.656H62.7001V17.868C63.2041 17.0653 63.8761 16.4493 64.7161 16.02C65.5748 15.5907 66.5174 15.376 67.5441 15.376C68.8321 15.376 69.9708 15.6653 70.9601 16.244C71.9494 16.8227 72.6868 17.672 73.1721 18.792C73.6014 17.7093 74.3108 16.8693 75.3001 16.272C76.2894 15.6747 77.3908 15.376 78.6041 15.376ZM90.3158 13.164C89.8304 13.164 89.4198 12.996 89.0838 12.66C88.7478 12.324 88.5798 11.9133 88.5798 11.428C88.5798 10.9427 88.7478 10.532 89.0838 10.196C89.4198 9.86 89.8304 9.692 90.3158 9.692C90.7824 9.692 91.1744 9.86 91.4918 10.196C91.8278 10.532 91.9958 10.9427 91.9958 11.428C91.9958 11.9133 91.8278 12.324 91.4918 12.66C91.1744 12.996 90.7824 13.164 90.3158 13.164ZM91.5478 15.656V31H88.9998V15.656H91.5478ZM103.366 15.376C105.233 15.376 106.745 15.9453 107.902 17.084C109.06 18.204 109.638 19.828 109.638 21.956V31H107.118V22.32C107.118 20.7893 106.736 19.6227 105.97 18.82C105.205 17.9987 104.16 17.588 102.834 17.588C101.49 17.588 100.417 18.008 99.6144 18.848C98.8304 19.688 98.4384 20.9107 98.4384 22.516V31H95.8904V15.656H98.4384V17.84C98.9424 17.056 99.6237 16.4493 100.482 16.02C101.36 15.5907 102.321 15.376 103.366 15.376ZM112.849 23.272C112.849 21.704 113.166 20.332 113.801 19.156C114.435 17.9613 115.303 17.0373 116.405 16.384C117.525 15.7307 118.766 15.404 120.129 15.404C121.473 15.404 122.639 15.6933 123.629 16.272C124.618 16.8507 125.355 17.5787 125.841 18.456V15.656H128.417V31H125.841V28.144C125.337 29.04 124.581 29.7867 123.573 30.384C122.583 30.9627 121.426 31.252 120.101 31.252C118.738 31.252 117.506 30.916 116.405 30.244C115.303 29.572 114.435 28.6293 113.801 27.416C113.166 26.2027 112.849 24.8213 112.849 23.272ZM125.841 23.3C125.841 22.1427 125.607 21.1347 125.141 20.276C124.674 19.4173 124.039 18.764 123.237 18.316C122.453 17.8493 121.585 17.616 120.633 17.616C119.681 17.616 118.813 17.84 118.029 18.288C117.245 18.736 116.619 19.3893 116.153 20.248C115.686 21.1067 115.453 22.1147 115.453 23.272C115.453 24.448 115.686 25.4747 116.153 26.352C116.619 27.2107 117.245 27.8733 118.029 28.34C118.813 28.788 119.681 29.012 120.633 29.012C121.585 29.012 122.453 28.788 123.237 28.34C124.039 27.8733 124.674 27.2107 125.141 26.352C125.607 25.4747 125.841 24.4573 125.841 23.3ZM135.27 18.148C135.718 17.2707 136.353 16.5893 137.174 16.104C138.014 15.6187 139.032 15.376 140.226 15.376V18.008H139.554C136.698 18.008 135.27 19.5573 135.27 22.656V31H132.722V15.656H135.27V18.148ZM156.384 15.656L147.144 38.224H144.512L147.536 30.832L141.348 15.656H144.176L148.992 28.088L153.752 15.656H156.384Z" fill="currentColor"/>
  <path d="M11.25 15.533C9.6831 14.5294 7.86076 13.9972 6 14C4.89299 13.9989 3.7939 14.1866 2.75 14.555C2.60379 14.6067 2.4772 14.7024 2.38766 14.829C2.29812 14.9557 2.25002 15.1069 2.25 15.262V29.512C2.25002 29.632 2.27882 29.7502 2.33398 29.8567C2.38915 29.9633 2.46907 30.055 2.56703 30.1243C2.665 30.1936 2.77815 30.2383 2.89699 30.2548C3.01583 30.2713 3.13689 30.259 3.25 30.219C4.13333 29.9074 5.06333 29.7488 6 29.75C7.995 29.75 9.823 30.457 11.25 31.636V15.533ZM12.75 31.636C14.2264 30.4141 16.0836 29.747 18 29.75C18.966 29.75 19.89 29.916 20.75 30.22C20.8632 30.26 20.9843 30.2723 21.1033 30.2557C21.2222 30.2392 21.3354 30.1944 21.4334 30.125C21.5314 30.0556 21.6113 29.9637 21.6664 29.8571C21.7215 29.7504 21.7501 29.6321 21.75 29.512V15.262C21.75 15.1069 21.7019 14.9557 21.6123 14.829C21.5228 14.7024 21.3962 14.6067 21.25 14.555C20.2061 14.1866 19.107 13.9989 18 14C16.1392 13.9972 14.3169 14.5294 12.75 15.533V31.636Z" fill="#FBBF24"/>
</svg>`;

const CSS = `
:root {
    color-scheme: light dark;
    --page: #fafafa;
    --card: #ffffff;
    --card-border: #f4f4f5;
    --text: #18181b;
    --muted: #71717a;
    --field-border: #d4d4d8;
    --field-bg: #ffffff;
    --accent: #eab308;
    --accent-hover: #facc15;
    --accent-text: #422006;
    --ring: rgba(234, 179, 8, 0.4);
    --danger: #b91c1c;
    --danger-bg: #fef2f2;
    --danger-border: #fecaca;
    --shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
}
@media (prefers-color-scheme: dark) {
    :root {
        --page: #0f172a;
        --card: #1e293b;
        --card-border: #1e293b;
        --text: #f1f5f9;
        --muted: #94a3b8;
        --field-border: #475569;
        --field-bg: #334155;
        --danger: #fca5a5;
        --danger-bg: rgba(220, 38, 38, 0.12);
        --danger-border: rgba(220, 38, 38, 0.35);
        --shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
    }
}

* { box-sizing: border-box; }

body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    background: var(--page);
    color: var(--text);
    font-family: "Inter var", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 15px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
}

main {
    width: 100%;
    max-width: 400px;
    background: var(--card);
    border: 1px solid var(--card-border);
    border-radius: 12px;
    box-shadow: var(--shadow);
    padding: 28px 26px;
}

.logo { display: block; margin-bottom: 22px; color: var(--text); }
h1 { font-size: 1.3rem; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
.sub { color: var(--muted); font-size: 0.9rem; margin: 6px 0 0; }

form { margin-top: 22px; display: flex; flex-direction: column; gap: 16px; }
.field { display: flex; flex-direction: column; gap: 6px; }
label { font-size: 0.85rem; font-weight: 500; }

input {
    width: 100%;
    padding: 11px 12px;
    font: inherit;
    color: var(--text);
    background: var(--field-bg);
    border: 1px solid var(--field-border);
    border-radius: 8px;
    transition: border-color 0.12s, box-shadow 0.12s;
}
input::placeholder { color: var(--muted); opacity: 0.75; }
input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--ring);
}
input[aria-invalid="true"] { border-color: var(--danger); }

button {
    width: 100%;
    padding: 12px 16px;
    font: inherit;
    font-weight: 600;
    color: var(--accent-text);
    background: var(--accent);
    border: 0;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.12s;
}
button:hover { background: var(--accent-hover); }
button:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 2px; }

.alert {
    display: flex;
    gap: 9px;
    align-items: flex-start;
    margin-top: 18px;
    padding: 10px 12px;
    font-size: 0.87rem;
    color: var(--danger);
    background: var(--danger-bg);
    border: 1px solid var(--danger-border);
    border-radius: 8px;
}
.alert svg { flex: none; margin-top: 2px; }

.foot {
    margin-top: 22px;
    padding-top: 18px;
    border-top: 1px solid var(--card-border);
    font-size: 0.87rem;
    color: var(--muted);
    text-align: center;
}
@media (prefers-color-scheme: dark) { .foot { border-top-color: rgba(255, 255, 255, 0.08); } }
.foot a { color: var(--text); font-weight: 500; }
.foot a:hover { text-decoration: none; }
.badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    margin-bottom: 18px;
    border-radius: 50%;
    color: var(--muted);
    background: var(--field-bg);
    border: 1px solid var(--card-border);
}
@media (prefers-color-scheme: dark) { .badge { border-color: rgba(255, 255, 255, 0.08); } }

.note-box {
    margin-top: 20px;
    padding: 12px 14px;
    font-size: 0.87rem;
    color: var(--muted);
    background: var(--field-bg);
    border-radius: 8px;
}
@media (prefers-color-scheme: dark) { .note-box { background: rgba(255, 255, 255, 0.04); } }
.note-box strong { color: var(--text); font-weight: 500; }
`;

const WARNING_ICON = `<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd"/></svg>`;

function alert(message) {
    return message ? `<div class="alert" role="alert">${WARNING_ICON}<span>${escapeHtml(message)}</span></div>` : "";
}

function page({ title, heading, subtitle, error, body, foot, badge }) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
  ${LOGO}
  ${badge ? `<div class="badge" aria-hidden="true">${badge}</div>` : ""}
  <h1>${escapeHtml(heading)}</h1>
  ${subtitle ? `<p class="sub">${escapeHtml(subtitle)}</p>` : ""}
  ${alert(error)}
  ${body ?? ""}
  ${foot ? `<p class="foot">${foot}</p>` : ""}
</main>
</body>
</html>`;
}

const action = (path, challenge) => `${path}?login_challenge=${encodeURIComponent(challenge)}`;

export function loginPage(challenge, error) {
    return page({
        title: "Sign in — Luminary",
        heading: "Sign in",
        subtitle: "Use the email address and password for your account.",
        error,
        body: `<form method="POST" action="${escapeHtml(action("/login", challenge))}">
    <div class="field">
      <label for="email">Email address</label>
      <input id="email" name="email" type="email" inputmode="email" autocomplete="email"
             placeholder="you@example.com" required autofocus
             ${error ? 'aria-invalid="true"' : ""}>
    </div>
    <div class="field">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required
             ${error ? 'aria-invalid="true"' : ""}>
    </div>
    <button type="submit">Sign in</button>
  </form>`,
        foot: `New here? <a href="${escapeHtml(action("/register", challenge))}">Create an account</a>`,
    });
}

export function registerPage(challenge, error) {
    return page({
        title: "Create an account — Luminary",
        heading: "Create your account",
        subtitle: "Your saved items and progress move with you, on every device.",
        error,
        body: `<form method="POST" action="${escapeHtml(action("/register", challenge))}">
    <div class="field">
      <label for="email">Email address</label>
      <input id="email" name="email" type="email" inputmode="email" autocomplete="email"
             placeholder="you@example.com" required autofocus
             ${error ? 'aria-invalid="true"' : ""}>
    </div>
    <div class="field">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="new-password"
             minlength="8" required>
    </div>
    <button type="submit">Create account</button>
  </form>`,
        foot: `Already have an account? <a href="${escapeHtml(action("/login", challenge))}">Sign in</a>`,
    });
}

const ERROR_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

/**
 * Anything that stops the flow before a form can be shown — an expired request,
 * a missing challenge, a route that does not exist, a failure upstream. There is
 * nothing to retry from here: the flow starts at the application, not at this
 * service, so the page says where to go rather than offering a dead button.
 */
export function errorPage(message) {
    return page({
        title: "Something went wrong — Luminary",
        heading: "Something went wrong",
        subtitle: message,
        badge: ERROR_ICON,
        body: `<div class="note-box">
    Sign-in requests expire for your safety. <strong>Go back to Luminary and sign in again</strong> — it only takes a moment.
  </div>`,
    });
}
