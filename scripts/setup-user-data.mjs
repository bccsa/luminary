import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiRequire = createRequire(join(root, "api/package.json"));

export function userDataConnection(
  env = process.env,
  envFile = join(root, "api/.env"),
) {
  const fileEnv =
    env.DB_CONNECTION_STRING === undefined && existsSync(envFile)
      ? apiRequire("dotenv").parse(readFileSync(envFile))
      : {};
  const configured = env.DB_CONNECTION_STRING ?? fileEnv.DB_CONNECTION_STRING;
  let url;
  try {
    url = new URL(configured ?? "http://127.0.0.1:5984");
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
  } catch {
    throw new Error(
      "Invalid DB_CONNECTION_STRING; expected an HTTP(S) CouchDB server URL.",
    );
  }

  const username =
    configured !== undefined
      ? decodeURIComponent(url.username)
      : (env.LUMINARY_COUCHDB_USER ?? "admin");
  const password =
    configured !== undefined
      ? decodeURIComponent(url.password)
      : (env.LUMINARY_COUCHDB_PASSWORD ?? "yourpassword");
  const headers =
    username || password
      ? {
          Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
        }
      : {};
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return {
    url,
    headers,
    source:
      env.DB_CONNECTION_STRING !== undefined
        ? "DB_CONNECTION_STRING from the environment"
        : configured !== undefined
          ? "DB_CONNECTION_STRING from api/.env"
          : "Docker/default credentials",
  };
}

export async function provisionUserDataDatabase(
  name,
  connection,
  request = fetch,
) {
  if (!/^[a-z][a-z0-9_-]*$/.test(name)) {
    throw new Error(
      "Use a lowercase database name containing letters, digits, underscores or hyphens.",
    );
  }
  const url = new URL(connection.url);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${name}`;
  const call = async (target, method) => {
    try {
      return await request(target, {
        method,
        headers: connection.headers,
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new Error(
        "Could not reach CouchDB using the configured connection. Check its host, port and network access.",
      );
    }
  };
  const checkAuth = (response) => {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `CouchDB rejected provisioning credentials (HTTP ${response.status}). Check the admin credentials in ${connection.source}.`,
      );
    }
  };
  const createUrl = new URL(url);
  createUrl.searchParams.set("partitioned", "true");
  const created = await call(createUrl, "PUT");
  checkAuth(created);
  if (![201, 202, 412].includes(created.status)) {
    throw new Error(
      `Could not provision user-data database (HTTP ${created.status}).`,
    );
  }
  const response = await call(url, "GET");
  checkAuth(response);
  if (!response.ok)
    throw new Error(
      `Could not verify user-data database (HTTP ${response.status}).`,
    );
  let info;
  try {
    info = await response.json();
  } catch {
    throw new Error("CouchDB returned an invalid database-info response.");
  }
  if (info.props?.partitioned !== true) {
    throw new Error(
      "User-data database must be partitioned. Existing data was left intact.",
    );
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const name = process.argv[2] || "luminary-user-data";
    const connection = userDataConnection();
    console.log(
      `[INFO] Using ${connection.source} for user-data provisioning.`,
    );
    await provisionUserDataDatabase(name, connection);
    console.log(`[SUCCESS] Partitioned user-data database ${name} is ready.`);
    console.log(
      `[INFO] Set DB_USERDATA_DATABASE=${name} and a dedicated USER_DATA_ID_SECRET in api/.env.`,
    );
    console.log(
      "[INFO] Generate the secret once with 'openssl rand -hex 32'; back it up and never rotate it.",
    );
  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    process.exitCode = 1;
  }
}
