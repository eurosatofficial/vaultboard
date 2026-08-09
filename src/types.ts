export type ServiceStatus = "operational" | "degraded" | "down" | "maintenance" | "unknown";

export interface Tag {
  id: string;
  name: string;
  color: string;
  serverCount?: number;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  serviceCount?: number;
}

export interface Server {
  id: string;
  name: string;
  hostname: string;
  ipAddress: string;
  operatingSystem: string;
  provider: string;
  location: string;
  notes: string;
  tags: Tag[];
  serviceCount: number;
  services?: Service[];
  createdAt: string;
  updatedAt: string;
}

export interface Service {
  id: string;
  name: string;
  serverId: string;
  serverName: string;
  url: string;
  port: number | null;
  categoryId: string | null;
  category: Category | null;
  description: string;
  status: ServiceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
}

export interface ApiErrorData {
  error: string;
  code: string;
  details?: { field: string; message: string }[];
}

export interface ServerInput {
  name: string;
  hostname: string;
  ipAddress: string;
  operatingSystem: string;
  provider: string;
  location: string;
  notes: string;
  tagIds: string[];
}

export interface ServiceInput {
  name: string;
  serverId: string;
  url: string;
  port: number | null;
  categoryId: string | null;
  description: string;
  status: ServiceStatus;
}
