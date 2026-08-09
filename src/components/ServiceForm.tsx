import { LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ApiError } from "../lib/api";
import type { Category, Server, Service, ServiceInput, ServiceStatus } from "../types";
import { FieldError } from "./UI";

const statusOptions: { value: ServiceStatus; label: string }[] = [
  { value: "operational", label: "Operational" },
  { value: "degraded", label: "Degraded" },
  { value: "down", label: "Down" },
  { value: "maintenance", label: "Maintenance" },
  { value: "unknown", label: "Unknown" },
];

export function ServiceForm({ service, servers, categories, defaultServerId, onSubmit, onCancel }: {
  service?: Service;
  servers: Server[];
  categories: Category[];
  defaultServerId?: string;
  onSubmit: (value: ServiceInput) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ServiceInput>(() => service ? {
    name: service.name,
    serverId: service.serverId,
    url: service.url,
    port: service.port,
    categoryId: service.categoryId,
    description: service.description,
    status: service.status,
  } : {
    name: "",
    serverId: defaultServerId || servers[0]?.id || "",
    url: "",
    port: null,
    categoryId: null,
    description: "",
    status: "operational",
  });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const update = <K extends keyof ServiceInput>(field: K, value: ServiceInput[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = "Name is required";
    if (!form.serverId) nextErrors.serverId = "Choose a server";
    if (Object.keys(nextErrors).length) return setErrors(nextErrors);
    setBusy(true);
    setFormError("");
    try {
      await onSubmit(form);
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        setErrors(Object.fromEntries((error.details || []).map((detail) => [detail.field, detail.message])));
      } else setFormError("Unable to save the service. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="entity-form" onSubmit={submit} noValidate>
      {formError && <div className="form-alert" role="alert">{formError}</div>}
      <div className="form-grid two-columns">
        <label className="field span-2">
          <span>Name <b>*</b></span>
          <input autoFocus value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. Grafana" maxLength={120} />
          <FieldError message={errors.name} />
        </label>
        <label className="field">
          <span>Server <b>*</b></span>
          <select value={form.serverId} onChange={(event) => update("serverId", event.target.value)}>
            <option value="">Choose a server</option>
            {servers.map((server) => <option value={server.id} key={server.id}>{server.name}</option>)}
          </select>
          <FieldError message={errors.serverId} />
        </label>
        <label className="field">
          <span>Status</span>
          <select value={form.status} onChange={(event) => update("status", event.target.value as ServiceStatus)}>
            {statusOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
          <FieldError message={errors.status} />
        </label>
        <label className="field span-2">
          <span>URL</span>
          <input value={form.url} onChange={(event) => update("url", event.target.value)} placeholder="https://grafana.example.com" maxLength={2048} inputMode="url" />
          <FieldError message={errors.url} />
        </label>
        <label className="field">
          <span>Port</span>
          <input type="number" min={1} max={65535} value={form.port ?? ""} onChange={(event) => update("port", event.target.value ? Number(event.target.value) : null)} placeholder="3000" inputMode="numeric" />
          <FieldError message={errors.port} />
        </label>
        <label className="field">
          <span>Category</span>
          <select value={form.categoryId || ""} onChange={(event) => update("categoryId", event.target.value || null)}>
            <option value="">Uncategorized</option>
            {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
          </select>
          <FieldError message={errors.categoryId} />
        </label>
        <label className="field span-2">
          <span>Description</span>
          <textarea value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="What this service does and who uses it…" rows={4} maxLength={2000} />
          <small>{form.description.length.toLocaleString()} / 2,000</small>
          <FieldError message={errors.description} />
        </label>
      </div>
      <div className="modal-actions sticky-actions">
        <button type="button" className="button ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="button primary" disabled={busy || !servers.length}>
          {busy && <LoaderCircle className="spin" size={17} />} {service ? "Save changes" : "Add service"}
        </button>
      </div>
    </form>
  );
}
