import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { VaultboardDatabase } from "./database.js";

export const SESSION_COOKIE = "vaultboard_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

export interface AuthContext {
  user: AuthUser;
  sessionId: string;
  csrfToken: string;
  tokenHash: string;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createSession(db: VaultboardDatabase, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(24).toString("base64url");
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, csrf_token, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), userId, hashToken(token), csrfToken, now, now, now + SESSION_TTL_MS);
  return { token, csrfToken, expiresAt: now + SESSION_TTL_MS };
}

export function setSessionCookie(res: Response, token: string, isProduction: boolean) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response, isProduction: boolean) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
  });
}

export function authentication(db: VaultboardDatabase): RequestHandler {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token || typeof token !== "string" || token.length > 128) return next();

    const tokenHash = hashToken(token);
    const row = db
      .prepare(
        `SELECT s.id AS session_id, s.csrf_token, s.expires_at, s.last_seen_at,
                u.id, u.email, u.display_name
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ?`,
      )
      .get(tokenHash) as any;

    if (!row) return next();
    const now = Date.now();
    if (row.expires_at <= now) {
      db.prepare("DELETE FROM sessions WHERE id = ?").run(row.session_id);
      return next();
    }

    req.auth = {
      user: { id: row.id, email: row.email, displayName: row.display_name },
      sessionId: row.session_id,
      csrfToken: row.csrf_token,
      tokenHash,
    };

    if (now - row.last_seen_at > RENEW_AFTER_MS) {
      db.prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?").run(
        now,
        now + SESSION_TTL_MS,
        row.session_id,
      );
    }
    next();
  };
}

export const requireAuth: RequestHandler = (req: AuthenticatedRequest, res, next) => {
  if (!req.auth) return res.status(401).json({ error: "Authentication required", code: "UNAUTHORIZED" });
  next();
};

export const requireCsrf: RequestHandler = (req: AuthenticatedRequest, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("x-vaultboard-request") !== "1") {
    return res.status(403).json({ error: "Request verification failed", code: "CSRF_FAILED" });
  }
  const sent = req.get("x-csrf-token") || "";
  const expected = req.auth?.csrfToken || "";
  const sentBuffer = Buffer.from(sent);
  const expectedBuffer = Buffer.from(expected);
  if (!sent || sentBuffer.length !== expectedBuffer.length || !timingSafeEqual(sentBuffer, expectedBuffer)) {
    return res.status(403).json({ error: "Request verification failed", code: "CSRF_FAILED" });
  }
  next();
};

export const requireAppRequest: RequestHandler = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("x-vaultboard-request") !== "1") {
    return res.status(403).json({ error: "Request verification failed", code: "REQUEST_REJECTED" });
  }
  next();
};
