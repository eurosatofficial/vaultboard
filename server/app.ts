import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import express, { type ErrorRequestHandler } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import type { AppConfig } from "./config.js";
import type { VaultboardDatabase } from "./database.js";
import { seedAccountDefaults } from "./database.js";
import {
  authentication,
  clearSessionCookie,
  createSession,
  requireAppRequest,
  requireAuth,
  requireCsrf,
  setSessionCookie,
  type AuthenticatedRequest,
} from "./auth.js";
import {
  categorySchema,
  loginSchema,
  passwordSchema,
  profileSchema,
  registerSchema,
  serverSchema,
  serviceSchema,
  tagSchema,
  uuidParamSchema,
} from "./validation.js";

interface AppOptions {
  db: VaultboardDatabase;
  config: AppConfig;
  serveClient?: boolean;
}

function now() {
  return new Date().toISOString();
}

function mapServer(row: any) {
  return {
    id: row.id,
    name: row.name,
    hostname: row.hostname,
    ipAddress: row.ip_address,
    operatingSystem: row.operating_system,
    provider: row.provider,
    location: row.location,
    notes: row.notes,
    serviceCount: Number(row.service_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapService(row: any) {
  return {
    id: row.id,
    name: row.name,
    serverId: row.server_id,
    serverName: row.server_name,
    url: row.url,
    port: row.port,
    categoryId: row.category_id,
    category: row.category_name
      ? { id: row.category_id, name: row.category_name, color: row.category_color }
      : null,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getServices(db: VaultboardDatabase, userId: string, filters: Record<string, string | undefined> = {}) {
  const clauses = ["sv.user_id = ?"];
  const params: unknown[] = [userId];
  if (filters.serverId) {
    clauses.push("sv.server_id = ?");
    params.push(filters.serverId);
  }
  if (filters.categoryId) {
    clauses.push("sv.category_id = ?");
    params.push(filters.categoryId);
  }
  if (filters.status) {
    clauses.push("sv.status = ?");
    params.push(filters.status);
  }
  if (filters.q) {
    clauses.push("(sv.name LIKE ? OR sv.description LIKE ? OR sv.url LIKE ? OR sr.name LIKE ?)");
    const search = `%${filters.q}%`;
    params.push(search, search, search, search);
  }
  const rows = db
    .prepare(
      `SELECT sv.*, sr.name AS server_name, c.name AS category_name, c.color AS category_color
       FROM services sv
       JOIN servers sr ON sr.id = sv.server_id
       LEFT JOIN categories c ON c.id = sv.category_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY sv.name COLLATE NOCASE`,
    )
    .all(...params);
  return rows.map(mapService);
}

function getServerTags(db: VaultboardDatabase, serverId: string) {
  return db
    .prepare(
      `SELECT t.id, t.name, t.color FROM tags t
       JOIN server_tags st ON st.tag_id = t.id
       WHERE st.server_id = ? ORDER BY t.name COLLATE NOCASE`,
    )
    .all(serverId);
}

function replaceServerTags(db: VaultboardDatabase, userId: string, serverId: string, tagIds: string[]) {
  const validTags = tagIds.length
    ? (db
        .prepare(`SELECT id FROM tags WHERE user_id = ? AND id IN (${tagIds.map(() => "?").join(",")})`)
        .all(userId, ...tagIds) as { id: string }[])
    : [];
  if (validTags.length !== tagIds.length) {
    const error = new Error("One or more tags do not exist") as Error & { status?: number };
    error.status = 400;
    throw error;
  }
  db.prepare("DELETE FROM server_tags WHERE server_id = ?").run(serverId);
  const insert = db.prepare("INSERT INTO server_tags (server_id, tag_id) VALUES (?, ?)");
  for (const tag of validTags) insert.run(serverId, tag.id);
}

export function createApp({ db, config, serveClient = false }: AppOptions) {
  const app = express();
  if (config.trustProxy) app.set("trust proxy", config.trustProxy);
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: serveClient
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:"],
              connectSrc: ["'self'"],
            },
          }
        : false,
    }),
  );
  app.use(express.json({ limit: "256kb", type: "application/json" }));
  app.use(cookieParser());
  app.use(authentication(db));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many sign-in attempts. Try again later.", code: "RATE_LIMITED" },
  });

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  app.get("/api/auth/status", (_req, res) => {
    const accountCount = Number((db.prepare("SELECT COUNT(*) AS count FROM users").get() as any).count);
    res.json({ registrationOpen: accountCount === 0 || config.allowRegistration, accountCount });
  });

  app.post("/api/auth/register", authLimiter, requireAppRequest, async (req, res, next) => {
    try {
      const input = registerSchema.parse(req.body);
      const accountCount = Number((db.prepare("SELECT COUNT(*) AS count FROM users").get() as any).count);
      if (accountCount > 0 && !config.allowRegistration) {
        return res.status(403).json({ error: "Registration is closed", code: "REGISTRATION_CLOSED" });
      }
      const userId = randomUUID();
      const passwordHash = await bcrypt.hash(input.password, 12);
      const timestamp = now();
      const create = db.transaction(() => {
        const currentAccounts = Number((db.prepare("SELECT COUNT(*) AS count FROM users").get() as any).count);
        if (currentAccounts > 0 && !config.allowRegistration) {
          const registrationError = new Error("Registration is closed") as Error & { status?: number };
          registrationError.status = 403;
          throw registrationError;
        }
        db.prepare(
          `INSERT INTO users (id, email, display_name, password_hash, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(userId, input.email, input.displayName, passwordHash, timestamp, timestamp);
        seedAccountDefaults(db, userId);
      });
      create();
      const session = createSession(db, userId);
      setSessionCookie(res, session.token, req.secure);
      return res.status(201).json({
        user: { id: userId, email: input.email, displayName: input.displayName },
        csrfToken: session.csrfToken,
      });
    } catch (error: any) {
      if (error?.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return res.status(409).json({ error: "An account with that email already exists", code: "DUPLICATE_EMAIL" });
      }
      next(error);
    }
  });

  app.post("/api/auth/login", authLimiter, requireAppRequest, async (req, res, next) => {
    try {
      const input = loginSchema.parse(req.body);
      const user = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(input.email) as any;
      const valid = user ? await bcrypt.compare(input.password, user.password_hash) : false;
      if (!user || !valid) {
        return res.status(401).json({ error: "Email or password is incorrect", code: "INVALID_CREDENTIALS" });
      }
      db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
      const session = createSession(db, user.id);
      setSessionCookie(res, session.token, req.secure);
      res.json({
        user: { id: user.id, email: user.email, displayName: user.display_name },
        csrfToken: session.csrfToken,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/auth/me", requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.auth!.user, csrfToken: req.auth!.csrfToken });
  });

  app.post("/api/auth/logout", requireAuth, requireCsrf, (req: AuthenticatedRequest, res) => {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(req.auth!.sessionId);
    clearSessionCookie(res, req.secure);
    res.status(204).end();
  });

  const api = express.Router();
  api.use(requireAuth, requireCsrf);

  api.get("/dashboard", (req: AuthenticatedRequest, res) => {
    const userId = req.auth!.user.id;
    const counts = db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM servers WHERE user_id = ?) AS servers,
          (SELECT COUNT(*) FROM services WHERE user_id = ?) AS services,
          (SELECT COUNT(*) FROM services WHERE user_id = ? AND status = 'operational') AS operational,
          (SELECT COUNT(*) FROM services WHERE user_id = ? AND status IN ('down','degraded')) AS attention`,
      )
      .get(userId, userId, userId, userId);
    const servicesByCategory = db
      .prepare(
        `SELECT COALESCE(c.name, 'Uncategorized') AS name, COALESCE(c.color, '#8491a8') AS color, COUNT(*) AS count
         FROM services sv LEFT JOIN categories c ON c.id = sv.category_id
         WHERE sv.user_id = ? GROUP BY c.id ORDER BY count DESC, name LIMIT 8`,
      )
      .all(userId);
    const serversByProvider = db
      .prepare(
        `SELECT CASE WHEN TRIM(provider) = '' THEN 'Unspecified' ELSE provider END AS name, COUNT(*) AS count
         FROM servers WHERE user_id = ? GROUP BY CASE WHEN TRIM(provider) = '' THEN 'Unspecified' ELSE provider END
         ORDER BY count DESC, name LIMIT 8`,
      )
      .all(userId);
    const recentServers = db
      .prepare(
        `SELECT s.*, COUNT(sv.id) AS service_count FROM servers s
         LEFT JOIN services sv ON sv.server_id = s.id
         WHERE s.user_id = ? GROUP BY s.id ORDER BY s.updated_at DESC LIMIT 5`,
      )
      .all(userId)
      .map(mapServer);
    const recentServices = getServices(db, userId).slice(0, 5);
    res.json({ counts, servicesByCategory, serversByProvider, recentServers, recentServices });
  });

  api.get("/servers", (req: AuthenticatedRequest, res) => {
    const userId = req.auth!.user.id;
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";
    const provider = typeof req.query.provider === "string" ? req.query.provider.slice(0, 100) : "";
    const tagId = typeof req.query.tagId === "string" ? req.query.tagId : "";
    const clauses = ["s.user_id = ?"];
    const params: unknown[] = [userId];
    if (q) {
      clauses.push("(s.name LIKE ? OR s.hostname LIKE ? OR s.ip_address LIKE ? OR s.provider LIKE ? OR s.location LIKE ?)");
      const search = `%${q}%`;
      params.push(search, search, search, search, search);
    }
    if (provider) {
      clauses.push("s.provider = ?");
      params.push(provider);
    }
    if (tagId) {
      clauses.push("EXISTS (SELECT 1 FROM server_tags st WHERE st.server_id = s.id AND st.tag_id = ?)");
      params.push(tagId);
    }
    const servers = db
      .prepare(
        `SELECT s.*, COUNT(sv.id) AS service_count FROM servers s
         LEFT JOIN services sv ON sv.server_id = s.id
         WHERE ${clauses.join(" AND ")} GROUP BY s.id ORDER BY s.name COLLATE NOCASE`,
      )
      .all(...params)
      .map((row: any) => ({ ...mapServer(row), tags: getServerTags(db, row.id) }));
    const providers = db
      .prepare("SELECT DISTINCT provider FROM servers WHERE user_id = ? AND provider != '' ORDER BY provider COLLATE NOCASE")
      .all(userId)
      .map((row: any) => row.provider);
    res.json({ servers, providers });
  });

  api.post("/servers", (req: AuthenticatedRequest, res, next) => {
    try {
      const input = serverSchema.parse(req.body);
      const id = randomUUID();
      const timestamp = now();
      const create = db.transaction(() => {
        db.prepare(
          `INSERT INTO servers
           (id, user_id, name, hostname, ip_address, operating_system, provider, location, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          req.auth!.user.id,
          input.name,
          input.hostname,
          input.ipAddress,
          input.operatingSystem,
          input.provider,
          input.location,
          input.notes,
          timestamp,
          timestamp,
        );
        replaceServerTags(db, req.auth!.user.id, id, input.tagIds);
      });
      create();
      const server = db.prepare("SELECT *, 0 AS service_count FROM servers WHERE id = ?").get(id) as any;
      res.status(201).json({ ...mapServer(server), tags: getServerTags(db, id), services: [] });
    } catch (error) {
      next(error);
    }
  });

  api.get("/servers/:id", (req: AuthenticatedRequest, res, next) => {
    try {
      const id = uuidParamSchema.parse(req.params.id);
      const row = db
        .prepare(
          `SELECT s.*, COUNT(sv.id) AS service_count FROM servers s
           LEFT JOIN services sv ON sv.server_id = s.id
           WHERE s.id = ? AND s.user_id = ? GROUP BY s.id`,
        )
        .get(id, req.auth!.user.id) as any;
      if (!row) return res.status(404).json({ error: "Server not found", code: "NOT_FOUND" });
      res.json({
        ...mapServer(row),
        tags: getServerTags(db, id),
        services: getServices(db, req.auth!.user.id, { serverId: id }),
      });
    } catch (error) {
      next(error);
    }
  });

  api.put("/servers/:id", (req: AuthenticatedRequest, res, next) => {
    try {
      const id = uuidParamSchema.parse(req.params.id);
      const input = serverSchema.parse(req.body);
      const exists = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(id, req.auth!.user.id);
      if (!exists) return res.status(404).json({ error: "Server not found", code: "NOT_FOUND" });
      const update = db.transaction(() => {
        db.prepare(
          `UPDATE servers SET name = ?, hostname = ?, ip_address = ?, operating_system = ?, provider = ?,
           location = ?, notes = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
        ).run(
          input.name,
          input.hostname,
          input.ipAddress,
          input.operatingSystem,
          input.provider,
          input.location,
          input.notes,
          now(),
          id,
          req.auth!.user.id,
        );
        replaceServerTags(db, req.auth!.user.id, id, input.tagIds);
      });
      update();
      const row = db.prepare("SELECT *, (SELECT COUNT(*) FROM services WHERE server_id = ?) AS service_count FROM servers WHERE id = ?").get(id, id) as any;
      res.json({ ...mapServer(row), tags: getServerTags(db, id) });
    } catch (error) {
      next(error);
    }
  });

  api.delete("/servers/:id", (req: AuthenticatedRequest, res, next) => {
    try {
      const id = uuidParamSchema.parse(req.params.id);
      const result = db.prepare("DELETE FROM servers WHERE id = ? AND user_id = ?").run(id, req.auth!.user.id);
      if (!result.changes) return res.status(404).json({ error: "Server not found", code: "NOT_FOUND" });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  api.get("/services", (req: AuthenticatedRequest, res) => {
    const filters = {
      q: typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : undefined,
      serverId: typeof req.query.serverId === "string" ? req.query.serverId : undefined,
      categoryId: typeof req.query.categoryId === "string" ? req.query.categoryId : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
    };
    res.json({ services: getServices(db, req.auth!.user.id, filters) });
  });

  api.post("/services", (req: AuthenticatedRequest, res, next) => {
    try {
      const input = serviceSchema.parse(req.body);
      const userId = req.auth!.user.id;
      const server = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(input.serverId, userId);
      if (!server) return res.status(400).json({ error: "Choose a valid server", code: "INVALID_SERVER" });
      if (input.categoryId) {
        const category = db.prepare("SELECT id FROM categories WHERE id = ? AND user_id = ?").get(input.categoryId, userId);
        if (!category) return res.status(400).json({ error: "Choose a valid category", code: "INVALID_CATEGORY" });
      }
      const id = randomUUID();
      const timestamp = now();
      db.prepare(
        `INSERT INTO services
         (id, user_id, server_id, category_id, name, url, port, description, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        userId,
        input.serverId,
        input.categoryId || null,
        input.name,
        input.url,
        input.port || null,
        input.description,
        input.status,
        timestamp,
        timestamp,
      );
      const row = db
        .prepare(
          `SELECT sv.*, sr.name AS server_name, c.name AS category_name, c.color AS category_color
           FROM services sv JOIN servers sr ON sr.id = sv.server_id LEFT JOIN categories c ON c.id = sv.category_id
           WHERE sv.id = ?`,
        )
        .get(id);
      res.status(201).json(mapService(row));
    } catch (error) {
      next(error);
    }
  });

  api.get("/services/:id", (req: AuthenticatedRequest, res, next) => {
    try {
      const id = uuidParamSchema.parse(req.params.id);
      const row = db
        .prepare(
          `SELECT sv.*, sr.name AS server_name, c.name AS category_name, c.color AS category_color
           FROM services sv JOIN servers sr ON sr.id = sv.server_id LEFT JOIN categories c ON c.id = sv.category_id
           WHERE sv.id = ? AND sv.user_id = ?`,
        )
        .get(id, req.auth!.user.id);
      if (!row) return res.status(404).json({ error: "Service not found", code: "NOT_FOUND" });
      res.json(mapService(row));
    } catch (error) {
      next(error);
    }
  });

  api.put("/services/:id", (req: AuthenticatedRequest, res, next) => {
    try {
      const id = uuidParamSchema.parse(req.params.id);
      const input = serviceSchema.parse(req.body);
      const userId = req.auth!.user.id;
      const existing = db.prepare("SELECT id FROM services WHERE id = ? AND user_id = ?").get(id, userId);
      if (!existing) return res.status(404).json({ error: "Service not found", code: "NOT_FOUND" });
      const server = db.prepare("SELECT id FROM servers WHERE id = ? AND user_id = ?").get(input.serverId, userId);
      if (!server) return res.status(400).json({ error: "Choose a valid server", code: "INVALID_SERVER" });
      if (input.categoryId) {
        const category = db.prepare("SELECT id FROM categories WHERE id = ? AND user_id = ?").get(input.categoryId, userId);
        if (!category) return res.status(400).json({ error: "Choose a valid category", code: "INVALID_CATEGORY" });
      }
      db.prepare(
        `UPDATE services SET server_id = ?, category_id = ?, name = ?, url = ?, port = ?, description = ?,
         status = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      ).run(
        input.serverId,
        input.categoryId || null,
        input.name,
        input.url,
        input.port || null,
        input.description,
        input.status,
        now(),
        id,
        userId,
      );
      const row = db
        .prepare(
          `SELECT sv.*, sr.name AS server_name, c.name AS category_name, c.color AS category_color
           FROM services sv JOIN servers sr ON sr.id = sv.server_id LEFT JOIN categories c ON c.id = sv.category_id
           WHERE sv.id = ?`,
        )
        .get(id);
      res.json(mapService(row));
    } catch (error) {
      next(error);
    }
  });

  api.delete("/services/:id", (req: AuthenticatedRequest, res, next) => {
    try {
      const id = uuidParamSchema.parse(req.params.id);
      const result = db.prepare("DELETE FROM services WHERE id = ? AND user_id = ?").run(id, req.auth!.user.id);
      if (!result.changes) return res.status(404).json({ error: "Service not found", code: "NOT_FOUND" });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  api.get("/tags", (req: AuthenticatedRequest, res) => {
    const tags = db
      .prepare(
        `SELECT t.id, t.name, t.color, COUNT(st.server_id) AS serverCount
         FROM tags t LEFT JOIN server_tags st ON st.tag_id = t.id
         WHERE t.user_id = ? GROUP BY t.id ORDER BY t.name COLLATE NOCASE`,
      )
      .all(req.auth!.user.id);
    res.json({ tags });
  });

  api.post("/tags", (req: AuthenticatedRequest, res, next) => {
    try {
      const input = tagSchema.parse(req.body);
      const tag = { id: randomUUID(), ...input, serverCount: 0 };
      db.prepare("INSERT INTO tags (id, user_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)").run(
        tag.id,
        req.auth!.user.id,
        tag.name,
        tag.color,
        now(),
      );
      res.status(201).json(tag);
    } catch (error) {
      next(error);
    }
  });

  api.put("/tags/:id", (req: AuthenticatedRequest, res, next) => {
    try {
      const id = uuidParamSchema.parse(req.params.id);
      const input = tagSchema.parse(req.body);
      const result = db.prepare("UPDATE tags SET name = ?, color = ? WHERE id = ? AND user_id = ?").run(
        input.name,
        input.color,
        id,
        req.auth!.user.id,
      );
      if (!result.changes) return res.status(404).json({ error: "Tag not found", code: "NOT_FOUND" });
      res.json({ id, ...input });
    } catch (error) {
      next(error);
    }
  });

  api.delete("/tags/:id", (req: AuthenticatedRequest, res, next) => {
    try {
      const id = uuidParamSchema.parse(req.params.id);
      const result = db.prepare("DELETE FROM tags WHERE id = ? AND user_id = ?").run(id, req.auth!.user.id);
      if (!result.changes) return res.status(404).json({ error: "Tag not found", code: "NOT_FOUND" });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  api.get("/categories", (req: AuthenticatedRequest, res) => {
    const categories = db
      .prepare(
        `SELECT c.id, c.name, c.color, COUNT(s.id) AS serviceCount
         FROM categories c LEFT JOIN services s ON s.category_id = c.id
         WHERE c.user_id = ? GROUP BY c.id ORDER BY c.name COLLATE NOCASE`,
      )
      .all(req.auth!.user.id);
    res.json({ categories });
  });

  api.post("/categories", (req: AuthenticatedRequest, res, next) => {
    try {
      const input = categorySchema.parse(req.body);
      const category = { id: randomUUID(), ...input, serviceCount: 0 };
      db.prepare("INSERT INTO categories (id, user_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)").run(
        category.id,
        req.auth!.user.id,
        category.name,
        category.color,
        now(),
      );
      res.status(201).json(category);
    } catch (error) {
      next(error);
    }
  });

  api.put("/categories/:id", (req: AuthenticatedRequest, res, next) => {
    try {
      const id = uuidParamSchema.parse(req.params.id);
      const input = categorySchema.parse(req.body);
      const result = db.prepare("UPDATE categories SET name = ?, color = ? WHERE id = ? AND user_id = ?").run(
        input.name,
        input.color,
        id,
        req.auth!.user.id,
      );
      if (!result.changes) return res.status(404).json({ error: "Category not found", code: "NOT_FOUND" });
      res.json({ id, ...input });
    } catch (error) {
      next(error);
    }
  });

  api.delete("/categories/:id", (req: AuthenticatedRequest, res, next) => {
    try {
      const id = uuidParamSchema.parse(req.params.id);
      const result = db.prepare("DELETE FROM categories WHERE id = ? AND user_id = ?").run(id, req.auth!.user.id);
      if (!result.changes) return res.status(404).json({ error: "Category not found", code: "NOT_FOUND" });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  api.get("/search", (req: AuthenticatedRequest, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";
    if (!q) return res.json({ servers: [], services: [] });
    const search = `%${q}%`;
    const servers = db
      .prepare(
        `SELECT s.*, COUNT(sv.id) AS service_count FROM servers s LEFT JOIN services sv ON sv.server_id = s.id
         WHERE s.user_id = ? AND (s.name LIKE ? OR s.hostname LIKE ? OR s.ip_address LIKE ? OR s.provider LIKE ? OR s.location LIKE ? OR s.notes LIKE ?)
         GROUP BY s.id ORDER BY s.name COLLATE NOCASE LIMIT 50`,
      )
      .all(req.auth!.user.id, search, search, search, search, search, search)
      .map((row: any) => ({ ...mapServer(row), tags: getServerTags(db, row.id) }));
    const services = getServices(db, req.auth!.user.id, { q }).slice(0, 50);
    res.json({ servers, services });
  });

  api.put("/profile", (req: AuthenticatedRequest, res, next) => {
    try {
      const input = profileSchema.parse(req.body);
      db.prepare("UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?").run(
        input.displayName,
        now(),
        req.auth!.user.id,
      );
      res.json({ user: { ...req.auth!.user, displayName: input.displayName } });
    } catch (error) {
      next(error);
    }
  });

  api.put("/password", async (req: AuthenticatedRequest, res, next) => {
    try {
      const input = passwordSchema.parse(req.body);
      const user = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(req.auth!.user.id) as any;
      if (!(await bcrypt.compare(input.currentPassword, user.password_hash))) {
        return res.status(400).json({ error: "Current password is incorrect", code: "INVALID_PASSWORD" });
      }
      const passwordHash = await bcrypt.hash(input.newPassword, 12);
      const change = db.transaction(() => {
        db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(
          passwordHash,
          now(),
          req.auth!.user.id,
        );
        db.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").run(req.auth!.user.id, req.auth!.sessionId);
      });
      change();
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.use("/api", api);

  app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found", code: "NOT_FOUND" }));

  if (serveClient) {
    const distPath = path.resolve("dist");
    const indexTemplate = fs.readFileSync(path.join(distPath, "index.html"), "utf8");
    app.use(express.static(distPath, { maxAge: "1d", index: false }));
    app.use((req, res, next) => {
      if (req.method === "GET" && req.accepts("html")) {
        const requestHost = (req.get("host") || `localhost:${config.port}`).replace(/[^a-zA-Z0-9.:[\]-]/g, "");
        const origin = `${req.protocol}://${requestHost}`;
        return res.type("html").send(indexTemplate.replaceAll("__VAULTBOARD_ORIGIN__", origin));
      }
      next();
    });
  }

  const errorHandler: ErrorRequestHandler = (error: any, _req, res, _next) => {
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: "Please check the highlighted fields",
        code: "VALIDATION_ERROR",
        details: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
      });
    }
    if (error?.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: "That name is already in use", code: "DUPLICATE" });
    }
    if (error instanceof SyntaxError && "body" in error) {
      return res.status(400).json({ error: "Invalid JSON body", code: "INVALID_JSON" });
    }
    const status = typeof error?.status === "number" ? error.status : 500;
    if (status >= 500) console.error("Vaultboard request failed", error);
    res.status(status).json({
      error: status >= 500 ? "Something went wrong. Please try again." : error.message,
      code: status >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR",
    });
  };
  app.use(errorHandler);

  return app;
}
