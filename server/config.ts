import "dotenv/config";
import path from "node:path";

export interface AppConfig {
  port: number;
  databasePath: string;
  isProduction: boolean;
  allowRegistration: boolean;
  trustProxy: string | number | boolean;
}

function parseTrustProxy(value: string | undefined): string | number | boolean {
  if (!value) return false;
  if (value === "false") return false;
  if (value === "true") return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

export function getConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: Number(process.env.PORT || 3001),
    databasePath: path.resolve(process.env.DATABASE_PATH || "./data/vaultboard.db"),
    isProduction: process.env.NODE_ENV === "production",
    allowRegistration: process.env.ALLOW_REGISTRATION === "true",
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    ...overrides,
  };
}
