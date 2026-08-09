import { Check, KeyRound, LoaderCircle, Monitor, Moon, Palette, Pencil, Plus, ShieldCheck, Sun, Tags, Trash2, UserRound } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ConfirmDialog } from "../components/Modal";
import { ErrorState, PageSkeleton } from "../components/States";
import { PageHeader } from "../components/UI";
import { useToast } from "../components/Toast";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { ApiError, api, jsonBody } from "../lib/api";
import type { Category, Tag, User } from "../types";

const palette = ["#5b8def", "#9b7af3", "#2bb8a3", "#f0a85c", "#ec6a79", "#4aa8c7", "#8a9a5b", "#8491a8"];
type SettingsTab = "account" | "organization" | "appearance" | "security";

export function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>("account");
  return (
    <div className="page settings-page">
      <PageHeader eyebrow="Workspace" title="Settings" description="Manage your account, organization tools, appearance, and security." />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          <button className={tab === "account" ? "active" : ""} onClick={() => setTab("account")}><UserRound size={17} /> Account</button>
          <button className={tab === "organization" ? "active" : ""} onClick={() => setTab("organization")}><Tags size={17} /> Tags & categories</button>
          <button className={tab === "appearance" ? "active" : ""} onClick={() => setTab("appearance")}><Palette size={17} /> Appearance</button>
          <button className={tab === "security" ? "active" : ""} onClick={() => setTab("security")}><ShieldCheck size={17} /> Security</button>
        </nav>
        <div className="settings-content">
          {tab === "account" && <AccountSettings />}
          {tab === "organization" && <OrganizationSettings />}
          {tab === "appearance" && <AppearanceSettings />}
          {tab === "security" && <SecuritySettings />}
        </div>
      </div>
    </div>
  );
}

function SettingSection({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="panel setting-section">
      <div className="setting-section-heading"><span className="setting-icon">{icon}</span><div><h2>{title}</h2><p>{description}</p></div></div>
      <div className="setting-section-body">{children}</div>
    </section>
  );
}

function AccountSettings() {
  const { user, updateUser } = useAuth();
  const { showToast } = useToast();
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const mutation = useMutation({
    mutationFn: () => api<{ user: User }>("/api/profile", { method: "PUT", body: jsonBody({ displayName }) }),
    onSuccess: (result) => { updateUser(result.user); showToast("Profile updated"); },
  });
  return (
    <SettingSection icon={<UserRound size={20} />} title="Account profile" description="The details shown in your Vaultboard workspace.">
      <form className="settings-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
        {mutation.isError && <div className="form-alert">{mutation.error.message}</div>}
        <label className="field"><span>Display name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} required /></label>
        <label className="field"><span>Email address</span><input value={user?.email || ""} disabled /><small>Email changes are intentionally disabled for the owner account.</small></label>
        <div className="settings-actions"><button className="button primary" disabled={mutation.isPending || !displayName.trim()}>{mutation.isPending && <LoaderCircle className="spin" size={16} />} Save profile</button></div>
      </form>
    </SettingSection>
  );
}

function OrganizationSettings() {
  const tags = useQuery({ queryKey: ["tags"], queryFn: () => api<{ tags: Tag[] }>("/api/tags") });
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => api<{ categories: Category[] }>("/api/categories") });
  if (tags.isLoading || categories.isLoading) return <PageSkeleton cards={2} />;
  if (tags.isError || categories.isError) return <ErrorState message={(tags.error || categories.error)?.message} onRetry={() => { tags.refetch(); categories.refetch(); }} />;
  return (
    <div className="settings-stack">
      <SettingSection icon={<Tags size={20} />} title="Server tags" description="Label servers by environment, purpose, team, or any system that fits your workflow.">
        <TaxonomyEditor kind="tags" items={tags.data!.tags.map((tag) => ({ ...tag, count: tag.serverCount || 0 }))} countLabel="servers" />
      </SettingSection>
      <SettingSection icon={<Palette size={20} />} title="Service categories" description="Group services into clear functional categories for filtering and reporting.">
        <TaxonomyEditor kind="categories" items={categories.data!.categories.map((category) => ({ ...category, count: category.serviceCount || 0 }))} countLabel="services" />
      </SettingSection>
    </div>
  );
}

function TaxonomyEditor({ kind, items, countLabel }: { kind: "tags" | "categories"; items: { id: string; name: string; color: string; count: number }[]; countLabel: string }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(palette[0]);
  const [editing, setEditing] = useState<{ id: string; name: string; color: string } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string; count: number } | null>(null);
  const client = useQueryClient();
  const { showToast } = useToast();
  const singular = kind === "tags" ? "tag" : "category";
  const invalidate = () => Promise.all([
    client.invalidateQueries({ queryKey: [kind] }),
    client.invalidateQueries({ queryKey: ["servers"] }),
    client.invalidateQueries({ queryKey: ["services"] }),
    client.invalidateQueries({ queryKey: ["dashboard"] }),
  ]);
  const create = useMutation({
    mutationFn: () => api(`/${"api"}/${kind}`, { method: "POST", body: jsonBody({ name, color }) }),
    onSuccess: async () => { await invalidate(); setName(""); showToast(`${singular[0].toUpperCase() + singular.slice(1)} created`); },
  });
  const update = useMutation({
    mutationFn: () => api(`/api/${kind}/${editing!.id}`, { method: "PUT", body: jsonBody({ name: editing!.name, color: editing!.color }) }),
    onSuccess: async () => { await invalidate(); setEditing(null); showToast(`${singular[0].toUpperCase() + singular.slice(1)} updated`); },
  });
  const remove = useMutation({
    mutationFn: () => api<void>(`/api/${kind}/${deleting!.id}`, { method: "DELETE" }),
    onSuccess: async () => { await invalidate(); setDeleting(null); showToast(`${singular[0].toUpperCase() + singular.slice(1)} deleted`); },
    onError: (error) => showToast(error.message, "error"),
  });
  const submit = (event: FormEvent) => { event.preventDefault(); if (name.trim()) create.mutate(); };
  return (
    <>
      <form className="taxonomy-create" onSubmit={submit}>
        <div className="color-picker compact-picker">
          {palette.map((item) => <button type="button" className={color === item ? "selected" : ""} style={{ background: item }} onClick={() => setColor(item)} key={item} aria-label={`Use color ${item}`}>{color === item && <Check size={12} />}</button>)}
        </div>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder={`New ${singular} name`} maxLength={50} aria-label={`New ${singular} name`} />
        <button className="button secondary" disabled={!name.trim() || create.isPending}><Plus size={16} /> Add</button>
      </form>
      {create.isError && <div className="form-alert compact-alert">{create.error.message}</div>}
      <div className="taxonomy-list">
        {items.map((item) => editing?.id === item.id ? (
          <form className="taxonomy-edit-row" key={item.id} onSubmit={(event) => { event.preventDefault(); update.mutate(); }}>
            <div className="color-picker compact-picker">
              {palette.slice(0, 6).map((choice) => <button type="button" className={editing.color === choice ? "selected" : ""} style={{ background: choice }} onClick={() => setEditing({ ...editing, color: choice })} key={choice} aria-label={`Use color ${choice}`} />)}
            </div>
            <input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} autoFocus maxLength={50} />
            <button className="button primary small" disabled={!editing.name.trim() || update.isPending}>Save</button>
            <button type="button" className="button ghost small" onClick={() => setEditing(null)}>Cancel</button>
          </form>
        ) : (
          <div className="taxonomy-row" key={item.id}>
            <span className="taxonomy-color" style={{ background: item.color }} />
            <strong>{item.name}</strong>
            <span>{item.count} {countLabel}</span>
            <button className="icon-button compact" onClick={() => setEditing(item)} aria-label={`Edit ${item.name}`}><Pencil size={15} /></button>
            <button className="icon-button compact danger-hover" onClick={() => setDeleting(item)} aria-label={`Delete ${item.name}`}><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => remove.mutate()} busy={remove.isPending} title={`Delete ${deleting?.name || singular}?`} description={kind === "categories" ? `Services using this category will become uncategorized. No services will be deleted.` : `This tag will be removed from ${deleting?.count || 0} servers. No servers will be deleted.`} />
    </>
  );
}

function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const options = [
    { value: "light" as const, label: "Light", description: "A bright, crisp workspace", icon: Sun },
    { value: "dark" as const, label: "Dark", description: "Easy on the eyes at night", icon: Moon },
    { value: "system" as const, label: "System", description: "Follow this device", icon: Monitor },
  ];
  return (
    <SettingSection icon={<Palette size={20} />} title="Interface theme" description="Choose the appearance that feels best for your workspace.">
      <div className="theme-options">
        {options.map(({ value, label, description, icon: Icon }) => (
          <button className={`theme-option ${theme === value ? "selected" : ""}`} onClick={() => setTheme(value)} key={value}>
            <span className={`theme-preview preview-${value}`}><span /><i /><b /></span>
            <span className="theme-option-copy"><Icon size={17} /><strong>{label}</strong><small>{description}</small></span>
            {theme === value && <span className="selected-check"><Check size={13} /></span>}
          </button>
        ))}
      </div>
    </SettingSection>
  );
}

function SecuritySettings() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState("");
  const { showToast } = useToast();
  const mutation = useMutation({
    mutationFn: () => api<void>("/api/password", { method: "PUT", body: jsonBody({ currentPassword, newPassword }) }),
    onSuccess: () => { setCurrentPassword(""); setNewPassword(""); setConfirm(""); showToast("Password changed. Other sessions were signed out."); },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setLocalError("");
    if (newPassword !== confirm) return setLocalError("New passwords do not match");
    mutation.mutate();
  };
  return (
    <SettingSection icon={<KeyRound size={20} />} title="Change password" description="Changing your password signs out every other Vaultboard session.">
      <form className="settings-form" onSubmit={submit}>
        {(localError || mutation.isError) && <div className="form-alert">{localError || (mutation.error instanceof ApiError ? mutation.error.message : "Unable to change password")}</div>}
        <label className="field"><span>Current password</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>
        <label className="field"><span>New password</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required /><small>Use at least 12 characters with a letter and number.</small></label>
        <label className="field"><span>Confirm new password</span><input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required /></label>
        <div className="settings-actions"><button className="button primary" disabled={mutation.isPending}>{mutation.isPending && <LoaderCircle className="spin" size={16} />} Change password</button></div>
      </form>
    </SettingSection>
  );
}
