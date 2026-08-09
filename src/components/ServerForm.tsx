import { LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ApiError } from "../lib/api";
import type { Server, ServerInput, Tag } from "../types";
import { FieldError } from "./UI";

const emptyServer: ServerInput = {
  name: "",
  hostname: "",
  ipAddress: "",
  operatingSystem: "",
  provider: "",
  location: "",
  notes: "",
  tagIds: [],
};

export function ServerForm({ server, tags, onSubmit, onCancel }: {
  server?: Server;
  tags: Tag[];
  onSubmit: (value: ServerInput) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ServerInput>(() => server ? {
    name: server.name,
    hostname: server.hostname,
    ipAddress: server.ipAddress,
    operatingSystem: server.operatingSystem,
    provider: server.provider,
    location: server.location,
    notes: server.notes,
    tagIds: server.tags.map((tag) => tag.id),
  } : emptyServer);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");

  const update = (field: keyof ServerInput, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };
  const toggleTag = (id: string) => {
    setForm((current) => ({
      ...current,
      tagIds: current.tagIds.includes(id) ? current.tagIds.filter((tagId) => tagId !== id) : [...current.tagIds, id],
    }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return setErrors({ name: "Name is required" });
    setBusy(true);
    setFormError("");
    try {
      await onSubmit(form);
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        setErrors(Object.fromEntries((error.details || []).map((detail) => [detail.field, detail.message])));
      } else setFormError("Unable to save the server. Try again.");
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
          <input autoFocus value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. Production Gateway" maxLength={120} />
          <FieldError message={errors.name} />
        </label>
        <label className="field">
          <span>Hostname</span>
          <input value={form.hostname} onChange={(event) => update("hostname", event.target.value)} placeholder="gateway.internal" maxLength={253} />
          <FieldError message={errors.hostname} />
        </label>
        <label className="field">
          <span>IP address</span>
          <input value={form.ipAddress} onChange={(event) => update("ipAddress", event.target.value)} placeholder="10.0.0.12" maxLength={45} inputMode="decimal" />
          <FieldError message={errors.ipAddress} />
        </label>
        <label className="field">
          <span>Operating system</span>
          <input value={form.operatingSystem} onChange={(event) => update("operatingSystem", event.target.value)} placeholder="Ubuntu 24.04 LTS" maxLength={100} />
          <FieldError message={errors.operatingSystem} />
        </label>
        <label className="field">
          <span>Provider</span>
          <input value={form.provider} onChange={(event) => update("provider", event.target.value)} placeholder="Hetzner" maxLength={100} />
          <FieldError message={errors.provider} />
        </label>
        <label className="field span-2">
          <span>Location</span>
          <input value={form.location} onChange={(event) => update("location", event.target.value)} placeholder="Nuremberg, Germany" maxLength={120} />
          <FieldError message={errors.location} />
        </label>
        <fieldset className="field span-2 tag-fieldset">
          <legend>Tags</legend>
          {tags.length ? (
            <div className="tag-selector">
              {tags.map((tag) => (
                <label className={`tag-choice ${form.tagIds.includes(tag.id) ? "selected" : ""}`} key={tag.id} style={{ "--tag-color": tag.color } as React.CSSProperties}>
                  <input type="checkbox" checked={form.tagIds.includes(tag.id)} onChange={() => toggleTag(tag.id)} />
                  <span />{tag.name}
                </label>
              ))}
            </div>
          ) : <small>Create tags in Settings to organize this server.</small>}
        </fieldset>
        <label className="field span-2">
          <span>Notes</span>
          <textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Access details, maintenance notes, or anything useful…" rows={4} maxLength={5000} />
          <small>{form.notes.length.toLocaleString()} / 5,000</small>
          <FieldError message={errors.notes} />
        </label>
      </div>
      <div className="modal-actions sticky-actions">
        <button type="button" className="button ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="button primary" disabled={busy}>
          {busy && <LoaderCircle className="spin" size={17} />} {server ? "Save changes" : "Add server"}
        </button>
      </div>
    </form>
  );
}
