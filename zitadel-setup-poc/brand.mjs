// Applies the Ory PoC's Luminary look to Zitadel's shipped login screens by
// setting the org label policy, reusing the same design tokens and logo so the
// two PoCs can be compared on appearance as well as behaviour.
import { readFileSync } from "node:fs";

const DOMAIN = process.env.ZITADEL_DOMAIN || "auth.luminary.local";
const BASE = `https://${DOMAIN}`;
const pat = readFileSync(process.env.PAT_PATH || "./secrets/seed-pat.txt", "utf8").trim();

// Lifted from ory-kratos-setup-poc/login-consent/views.js so the palettes stay
// the same in both PoCs.
const THEME = {
    primaryColor: "#eab308",
    backgroundColor: "#fafafa",
    fontColor: "#18181b",
    warnColor: "#b91c1c",
    primaryColorDark: "#facc15",
    backgroundColorDark: "#0f172a",
    fontColorDark: "#f1f5f9",
    warnColorDark: "#fca5a5",
    hideLoginNameSuffix: true,
    disableWatermark: true,
    themeMode: "THEME_MODE_AUTO",
};

const call = async (path, body, method = "POST") => {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${path} -> ${res.status}: ${JSON.stringify(json)}`);
    return json;
};

// The org may not have its own policy yet, in which case it inherits the
// instance default and PUT reports 404.
try {
    await call("/management/v1/policies/label", THEME, "PUT");
} catch {
    await call("/management/v1/policies/label", THEME, "POST");
}

// The logo is the same SVG the Ory login pages render.
const views = readFileSync("../ory-kratos-setup-poc/login-consent/views.js", "utf8");
const svg = views.match(/const LOGO = `([\s\S]*?)`;/)?.[1];

async function uploadLogo(endpoint, body, type) {
    const form = new FormData();
    form.append("file", new Blob([body], { type }), `logo.${type === "image/svg+xml" ? "svg" : "png"}`);
    const res = await fetch(`${BASE}${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${pat}` },
        body: form,
    });
    return { ok: res.ok, status: res.status, text: await res.text().catch(() => "") };
}

if (svg) {
    for (const [label, endpoint] of [
        ["light", "/assets/v1/org/policy/label/logo"],
        ["dark", "/assets/v1/org/policy/label/logo/dark"],
    ]) {
        const r = await uploadLogo(endpoint, svg, "image/svg+xml");
        console.log(`logo (${label}) -> ${r.ok ? "uploaded" : `skipped (${r.status}) ${r.text.slice(0, 120)}`}`);
    }
}

await call("/management/v1/policies/label/_activate", {});
console.log("\nBranding applied and activated. Reload the login tab to see it.");
