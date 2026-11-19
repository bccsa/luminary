import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  provisionUserDataDatabase,
  userDataConnection,
} from "./setup-user-data.mjs";

const missingEnv = join(tmpdir(), "luminary-no-env-file-for-provision-test");
const response = (status, info = { props: { partitioned: true } }) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => info,
});

test("loads quoted API connection settings, including encoded credentials and a custom server path", async () => {
  const directory = mkdtempSync(join(tmpdir(), "luminary-provision-"));
  try {
    const envFile = join(directory, ".env");
    writeFileSync(
      envFile,
      'DB_CONNECTION_STRING="https://api-admin:p%40ss%3Aword@couch.example:6984/proxy/"\n',
    );
    const connection = userDataConnection(
      { LUMINARY_COUCHDB_PASSWORD: "wrong-default" },
      envFile,
    );
    const requests = [];
    await provisionUserDataDatabase(
      "luminary-user-db",
      connection,
      async (url, options) => {
        requests.push({ url: String(url), method: options.method });
        assert.equal(
          options.headers.Authorization,
          `Basic ${Buffer.from("api-admin:p@ss:word").toString("base64")}`,
        );
        assert.equal(new URL(url).password, "");
        return response(options.method === "PUT" ? 201 : 200);
      },
    );
    assert.deepEqual(requests, [
      {
        url: "https://couch.example:6984/proxy/luminary-user-db?partitioned=true",
        method: "PUT",
      },
      {
        url: "https://couch.example:6984/proxy/luminary-user-db",
        method: "GET",
      },
    ]);
    assert.equal(connection.source, "DB_CONNECTION_STRING from api/.env");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("shell DB_CONNECTION_STRING overrides api/.env", () => {
  const directory = mkdtempSync(join(tmpdir(), "luminary-provision-"));
  try {
    const envFile = join(directory, ".env");
    writeFileSync(
      envFile,
      "DB_CONNECTION_STRING=http://wrong:wrong@old.example:5984\n",
    );
    const connection = userDataConnection(
      { DB_CONNECTION_STRING: "http://admin:correct@new.example:5985" },
      envFile,
    );
    assert.equal(connection.url.host, "new.example:5985");
    assert.equal(
      connection.source,
      "DB_CONNECTION_STRING from the environment",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("retains Docker/environment credential fallback without an API connection", () => {
  const connection = userDataConnection(
    {
      LUMINARY_COUCHDB_USER: "local-admin",
      LUMINARY_COUCHDB_PASSWORD: "local-password",
    },
    missingEnv,
  );
  assert.equal(connection.url.origin, "http://127.0.0.1:5984");
  assert.equal(
    connection.headers.Authorization,
    `Basic ${Buffer.from("local-admin:local-password").toString("base64")}`,
  );
});

test("rejects a malformed configured URL without falling back or exposing its value", () => {
  assert.throws(
    () =>
      userDataConnection(
        { DB_CONNECTION_STRING: "secret-password-not-a-url" },
        missingEnv,
      ),
    (error) => {
      assert.match(error.message, /Invalid DB_CONNECTION_STRING/);
      assert.doesNotMatch(error.message, /secret-password/);
      return true;
    },
  );
});

test("accepts an already partitioned database without deleting it", async () => {
  const methods = [];
  await provisionUserDataDatabase(
    "luminary-user-db",
    userDataConnection({}, missingEnv),
    async (_url, options) => {
      methods.push(options.method);
      return response(options.method === "PUT" ? 412 : 200);
    },
  );
  assert.deepEqual(methods, ["PUT", "GET"]);
});

test("rejects an existing plain database and preserves it", async () => {
  const methods = [];
  await assert.rejects(
    provisionUserDataDatabase(
      "luminary-user-db",
      userDataConnection({}, missingEnv),
      async (_url, options) => {
        methods.push(options.method);
        return response(options.method === "PUT" ? 412 : 200, {
          props: { partitioned: false },
        });
      },
    ),
    /must be partitioned/,
  );
  assert.deepEqual(methods, ["PUT", "GET"]);
});

for (const status of [401, 403]) {
  test(`explains HTTP ${status} without printing credentials`, async () => {
    const connection = userDataConnection(
      {
        DB_CONNECTION_STRING:
          "http://test-admin:private-password@couch.example",
      },
      missingEnv,
    );
    await assert.rejects(
      provisionUserDataDatabase("luminary-user-db", connection, async () =>
        response(status),
      ),
      (error) => {
        assert.match(error.message, new RegExp(`HTTP ${status}`));
        assert.match(
          error.message,
          /DB_CONNECTION_STRING from the environment/,
        );
        assert.doesNotMatch(error.message, /private-password|test-admin/);
        return true;
      },
    );
  });
}

test("rejects unsafe database names before making a request", async () => {
  let requested = false;
  await assert.rejects(
    provisionUserDataDatabase(
      "../shared",
      userDataConnection({}, missingEnv),
      async () => {
        requested = true;
      },
    ),
    /lowercase database name/,
  );
  assert.equal(requested, false);
});

test("hides transport errors that may contain a credential-bearing URL", async () => {
  await assert.rejects(
    provisionUserDataDatabase(
      "luminary-user-db",
      userDataConnection({}, missingEnv),
      async () => {
        throw new Error("Failed http://admin:private-password@couch.example");
      },
    ),
    (error) => {
      assert.match(error.message, /Could not reach CouchDB/);
      assert.doesNotMatch(error.message, /private-password/);
      return true;
    },
  );
});
