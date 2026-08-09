import { Boxes, Grid2X2, List, MapPin, MoreHorizontal, Pencil, Plus, Search, Server as ServerIcon, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog, Modal } from "../components/Modal";
import { ServerForm } from "../components/ServerForm";
import { EmptyState, ErrorState, PageSkeleton } from "../components/States";
import { PageHeader, TagPills } from "../components/UI";
import { useToast } from "../components/Toast";
import { api, jsonBody } from "../lib/api";
import type { Server, ServerInput, Tag } from "../types";

export function ServersPage() {
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("");
  const [tagId, setTagId] = useState("");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Server | null>(null);
  const [deleting, setDeleting] = useState<Server | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const client = useQueryClient();
  const { showToast } = useToast();
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (provider) params.set("provider", provider);
  if (tagId) params.set("tagId", tagId);
  const serversQuery = useQuery({
    queryKey: ["servers", search, provider, tagId],
    queryFn: () => api<{ servers: Server[]; providers: string[] }>(`/api/servers?${params}`),
  });
  const tagsQuery = useQuery({ queryKey: ["tags"], queryFn: () => api<{ tags: Tag[] }>("/api/tags") });

  const invalidate = () => Promise.all([
    client.invalidateQueries({ queryKey: ["servers"] }),
    client.invalidateQueries({ queryKey: ["dashboard"] }),
    client.invalidateQueries({ queryKey: ["search"] }),
  ]);
  const createMutation = useMutation({
    mutationFn: (input: ServerInput) => api<Server>("/api/servers", { method: "POST", body: jsonBody(input) }),
    onSuccess: async () => { await invalidate(); setCreateOpen(false); showToast("Server added"); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ServerInput }) => api<Server>(`/api/servers/${id}`, { method: "PUT", body: jsonBody(input) }),
    onSuccess: async () => { await invalidate(); setEditing(null); showToast("Server updated"); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api<void>(`/api/servers/${id}`, { method: "DELETE" }),
    onSuccess: async () => { await invalidate(); setDeleting(null); showToast("Server and its services deleted"); },
    onError: (error) => showToast(error.message, "error"),
  });

  if (serversQuery.isLoading || tagsQuery.isLoading) return <PageSkeleton />;
  if (serversQuery.isError) return <ErrorState message={serversQuery.error.message} onRetry={() => serversQuery.refetch()} />;
  const servers = serversQuery.data!.servers;
  const providers = serversQuery.data!.providers;
  const tags = tagsQuery.data?.tags || [];
  const filtered = search || provider || tagId;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Inventory"
        title="Servers"
        description={`${servers.length} ${servers.length === 1 ? "server" : "servers"} in this view`}
        actions={<button className="button primary" onClick={() => setCreateOpen(true)}><Plus size={17} /> Add server</button>}
      />
      <div className="toolbar">
        <label className="search-input"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, host, IP, provider…" aria-label="Search servers" /></label>
        <select value={provider} onChange={(event) => setProvider(event.target.value)} aria-label="Filter by provider">
          <option value="">All providers</option>
          {providers.map((item) => <option value={item} key={item}>{item}</option>)}
        </select>
        <select value={tagId} onChange={(event) => setTagId(event.target.value)} aria-label="Filter by tag">
          <option value="">All tags</option>
          {tags.map((tag) => <option value={tag.id} key={tag.id}>{tag.name}</option>)}
        </select>
        <div className="view-toggle" role="group" aria-label="View style">
          <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label="Grid view"><Grid2X2 size={17} /></button>
          <button className={view === "table" ? "active" : ""} onClick={() => setView("table")} aria-label="Table view"><List size={18} /></button>
        </div>
      </div>
      {!servers.length ? (
        <EmptyState
          icon={<ServerIcon size={25} />}
          title={filtered ? "No matching servers" : "Your server inventory is empty"}
          description={filtered ? "Try clearing a filter or using a broader search." : "Add your first server to start mapping the services and systems you run."}
          action={filtered
            ? <button className="button secondary" onClick={() => { setSearch(""); setProvider(""); setTagId(""); }}>Clear filters</button>
            : <button className="button primary" onClick={() => setCreateOpen(true)}><Plus size={17} /> Add first server</button>}
        />
      ) : view === "grid" ? (
        <div className="server-grid">
          {servers.map((server) => (
            <article className="server-card" key={server.id}>
              <div className="card-topline"><span className="server-avatar"><ServerIcon size={20} /></span>
                <div className="context-menu-wrap">
                  <button className="icon-button compact" onClick={() => setMenu(menu === server.id ? null : server.id)} aria-label={`Actions for ${server.name}`}><MoreHorizontal size={19} /></button>
                  {menu === server.id && <div className="context-menu"><button onClick={() => { setEditing(server); setMenu(null); }}><Pencil size={15} /> Edit</button><button className="danger-text" onClick={() => { setDeleting(server); setMenu(null); }}><Trash2 size={15} /> Delete</button></div>}
                </div>
              </div>
              <Link className="server-card-link" to={`/servers/${server.id}`}>
                <h2>{server.name}</h2>
                <p className="mono">{server.hostname || server.ipAddress || "Address not set"}</p>
                <div className="server-meta">
                  <span><Boxes size={15} /> {server.serviceCount} {server.serviceCount === 1 ? "service" : "services"}</span>
                  <span><MapPin size={15} /> {server.location || "No location"}</span>
                </div>
                <div className="card-divider" />
                <div className="server-card-footer">
                  <span className="provider-badge">{server.provider || "Unspecified provider"}</span>
                  <span>{server.operatingSystem || "OS not set"}</span>
                </div>
                {server.tags.length > 0 && <TagPills tags={server.tags} limit={3} />}
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <thead><tr><th>Server</th><th>Provider</th><th>Location</th><th>Services</th><th>Tags</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {servers.map((server) => (
                <tr key={server.id}>
                  <td><Link className="table-primary" to={`/servers/${server.id}`}><span className="row-icon server"><ServerIcon size={16} /></span><span><strong>{server.name}</strong><small>{server.hostname || server.ipAddress || "No address"}</small></span></Link></td>
                  <td>{server.provider || <span className="muted">Unspecified</span>}</td>
                  <td>{server.location || <span className="muted">—</span>}</td>
                  <td>{server.serviceCount}</td>
                  <td><TagPills tags={server.tags} limit={2} /></td>
                  <td><button className="icon-button compact" onClick={() => setEditing(server)} aria-label={`Edit ${server.name}`}><Pencil size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add server" description="Create a home for the services running on this machine." size="large">
        <ServerForm tags={tags} onCancel={() => setCreateOpen(false)} onSubmit={(input) => createMutation.mutateAsync(input)} />
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit server" description={editing ? `Update ${editing.name}'s inventory details.` : ""} size="large">
        {editing && <ServerForm server={editing} tags={tags} onCancel={() => setEditing(null)} onSubmit={(input) => updateMutation.mutateAsync({ id: editing.id, input })} />}
      </Modal>
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        busy={deleteMutation.isPending}
        title={`Delete ${deleting?.name || "server"}?`}
        description={`This permanently deletes the server and all ${deleting?.serviceCount || 0} services attached to it. This action cannot be undone.`}
      />
    </div>
  );
}
