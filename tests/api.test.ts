import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../server/app.js";
import { getConfig } from "../server/config.js";
import { openDatabase, type VaultboardDatabase } from "../server/database.js";

describe("Vaultboard API", () => {
  let db: VaultboardDatabase;
  let app: ReturnType<typeof createApp>;
  let agent: ReturnType<typeof request.agent>;
  let csrf = "";
  let serverId = "";
  let categoryId = "";

  before(() => {
    db = openDatabase(":memory:");
    app = createApp({
      db,
      config: getConfig({ databasePath: ":memory:", isProduction: false, allowRegistration: false }),
    });
    agent = request.agent(app);
  });

  after(() => db.close());

  it("reports health without authentication", async () => {
    const response = await agent.get("/api/health").expect(200);
    assert.equal(response.body.status, "ok");
  });

  it("creates the first owner and closes registration", async () => {
    const response = await agent
      .post("/api/auth/register")
      .set("X-Vaultboard-Request", "1")
      .send({ displayName: "Vault Owner", email: "owner@example.com", password: "correct-horse-42" })
      .expect(201);
    assert.equal(response.body.user.email, "owner@example.com");
    const sessionCookie = response.headers["set-cookie"]?.[0] || "";
    assert.match(sessionCookie, /HttpOnly/i);
    assert.match(sessionCookie, /SameSite=Lax/i);
    csrf = response.body.csrfToken;
    assert.ok(csrf.length > 20);

    const categories = await agent.get("/api/categories").expect(200);
    assert.equal(categories.body.categories.length, 4);
    categoryId = categories.body.categories[0].id;

    await request(app)
      .post("/api/auth/register")
      .set("X-Vaultboard-Request", "1")
      .send({ displayName: "Second User", email: "second@example.com", password: "another-password-42" })
      .expect(403);
  });

  it("rejects unauthenticated and unverifiable writes", async () => {
    await request(app).get("/api/servers").expect(401);
    await agent.post("/api/servers").send({}).expect(403);
  });

  it("validates input and creates a server", async () => {
    const invalid = await agent
      .post("/api/servers")
      .set("X-Vaultboard-Request", "1")
      .set("X-CSRF-Token", csrf)
      .send({ name: "Bad", hostname: "bad host", ipAddress: "999.1.1.1", operatingSystem: "", provider: "", location: "", notes: "", tagIds: [] })
      .expect(400);
    assert.equal(invalid.body.code, "VALIDATION_ERROR");

    const created = await agent
      .post("/api/servers")
      .set("X-Vaultboard-Request", "1")
      .set("X-CSRF-Token", csrf)
      .send({
        name: "Edge One",
        hostname: "edge-01.internal",
        ipAddress: "10.0.0.10",
        operatingSystem: "Debian 13",
        provider: "Homelab",
        location: "Berlin",
        notes: "Primary edge node",
        tagIds: [],
      })
      .expect(201);
    serverId = created.body.id;
    assert.equal(created.body.name, "Edge One");
  });

  it("creates, filters, searches, and updates a service", async () => {
    const created = await agent
      .post("/api/services")
      .set("X-Vaultboard-Request", "1")
      .set("X-CSRF-Token", csrf)
      .send({
        name: "Grafana",
        serverId,
        url: "https://grafana.example.com",
        port: 3000,
        categoryId,
        description: "Infrastructure dashboards",
        status: "operational",
      })
      .expect(201);
    assert.equal(created.body.serverName, "Edge One");

    const search = await agent.get("/api/search?q=Grafana").expect(200);
    assert.equal(search.body.services.length, 1);

    const dashboard = await agent.get("/api/dashboard").expect(200);
    assert.equal(dashboard.body.counts.servers, 1);
    assert.equal(dashboard.body.counts.services, 1);
    assert.equal(dashboard.body.counts.operational, 1);

    await agent
      .put(`/api/services/${created.body.id}`)
      .set("X-Vaultboard-Request", "1")
      .set("X-CSRF-Token", csrf)
      .send({
        name: "Grafana",
        serverId,
        url: "https://grafana.example.com",
        port: 3000,
        categoryId,
        description: "Infrastructure dashboards",
        status: "maintenance",
      })
      .expect(200);
    const filtered = await agent.get("/api/services?status=maintenance").expect(200);
    assert.equal(filtered.body.services.length, 1);
  });

  it("cascades services when a server is deleted", async () => {
    await agent
      .delete(`/api/servers/${serverId}`)
      .set("X-Vaultboard-Request", "1")
      .set("X-CSRF-Token", csrf)
      .expect(204);
    const services = await agent.get("/api/services").expect(200);
    assert.equal(services.body.services.length, 0);
  });
});

describe("Persistence and authorization", () => {
  it("persists records after the database is closed and reopened", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vaultboard-persistence-"));
    const filename = path.join(directory, "vaultboard.db");
    const first = openDatabase(filename);
    const timestamp = new Date().toISOString();
    first.prepare(
      "INSERT INTO users (id, email, display_name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("persistent-user", "persist@example.com", "Persistent User", "test-hash", timestamp, timestamp);
    first.close();

    const reopened = openDatabase(filename);
    const row = reopened.prepare("SELECT email FROM users WHERE id = ?").get("persistent-user") as { email: string };
    assert.equal(row.email, "persist@example.com");
    reopened.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("isolates one account's inventory from another account", async () => {
    const isolatedDb = openDatabase(":memory:");
    const isolatedApp = createApp({
      db: isolatedDb,
      config: getConfig({ databasePath: ":memory:", isProduction: false, allowRegistration: true }),
    });
    const alice = request.agent(isolatedApp);
    const bob = request.agent(isolatedApp);
    const aliceRegistration = await alice
      .post("/api/auth/register")
      .set("X-Vaultboard-Request", "1")
      .send({ displayName: "Alice", email: "alice@example.com", password: "alice-password-42" })
      .expect(201);
    await bob
      .post("/api/auth/register")
      .set("X-Vaultboard-Request", "1")
      .send({ displayName: "Bob", email: "bob@example.com", password: "bob-password-42" })
      .expect(201);
    const created = await alice
      .post("/api/servers")
      .set("X-Vaultboard-Request", "1")
      .set("X-CSRF-Token", aliceRegistration.body.csrfToken)
      .send({ name: "Alice Only", hostname: "", ipAddress: "", operatingSystem: "", provider: "", location: "", notes: "", tagIds: [] })
      .expect(201);

    const bobInventory = await bob.get("/api/servers").expect(200);
    assert.equal(bobInventory.body.servers.length, 0);
    await bob.get(`/api/servers/${created.body.id}`).expect(404);
    isolatedDb.close();
  });
});
