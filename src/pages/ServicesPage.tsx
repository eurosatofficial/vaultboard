import { Boxes, ExternalLink, Pencil, Plus, Search, Server as ServerIcon, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog, Modal } from "../components/Modal";
import { ServiceForm } from "../components/ServiceForm";
import { EmptyState, ErrorState, PageSkeleton } from "../components/States";
import { PageHeader, StatusBadge } from "../components/UI";
import { useToast } from "../components/Toast";
import { api, jsonBody } from "../lib/api";
import type { Category, Server, Service, ServiceInput, ServiceStatus } from "../types";

const statuses: { value: ServiceStatus; label: string }[] = [
  { value: "operational", label: "Operational" },
  { value: "degraded", label: "Degraded" },
  { value: "down", label: "Down" },
  { value: "maintenance", label: "Maintenance" },
  { value: "unknown", label: "Unknown" },
];

export function ServicesPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState<Service | null>(null);
  const client = useQueryClient();
  const { showToast } = useToast();
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (status) params.set("status", status);
  if (categoryId) params.set("categoryId", categoryId);
  const servicesQuery = useQuery({ queryKey: ["services", search, status, categoryId], queryFn: () => api<{ services: Service[] }>(`/api/services?${params}`) });
  const serversQuery = useQuery({ queryKey: ["servers", "all-for-form"], queryFn: () => api<{ servers: Server[] }>("/api/servers") });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: () => api<{ categories: Category[] }>("/api/categories") });
  const invalidate = () => Promise.all([
    client.invalidateQueries({ queryKey: ["services"] }),
    client.invalidateQueries({ queryKey: ["servers"] }),
    client.invalidateQueries({ queryKey: ["dashboard"] }),
    client.invalidateQueries({ queryKey: ["search"] }),
    client.invalidateQueries({ queryKey: ["server"] }),
  ]);
  const createMutation = useMutation({
    mutationFn: (input: ServiceInput) => api<Service>("/api/services", { method: "POST", body: jsonBody(input) }),
    onSuccess: async () => { await invalidate(); setCreateOpen(false); showToast("Service added"); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ServiceInput }) => api<Service>(`/api/services/${id}`, { method: "PUT", body: jsonBody(input) }),
    onSuccess: async () => { await invalidate(); setEditing(null); showToast("Service updated"); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api<void>(`/api/services/${id}`, { method: "DELETE" }),
    onSuccess: async () => { await invalidate(); setDeleting(null); showToast("Service deleted"); },
    onError: (error) => showToast(error.message, "error"),
  });

  if (servicesQuery.isLoading || serversQuery.isLoading || categoriesQuery.isLoading) return <PageSkeleton />;
  if (servicesQuery.isError) return <ErrorState message={servicesQuery.error.message} onRetry={() => servicesQuery.refetch()} />;
  const services = servicesQuery.data!.services;
  const servers = serversQuery.data?.servers || [];
  const categories = categoriesQuery.data?.categories || [];
  const filtered = search || status || categoryId;
  return (
    <div className="page">
      <PageHeader
        eyebrow="Applications"
        title="Services"
        description={`${services.length} ${services.length === 1 ? "service" : "services"} in this view`}
        actions={<button className="button primary" onClick={() => setCreateOpen(true)} disabled={!servers.length} title={!servers.length ? "Add a server first" : undefined}><Plus size={17} /> Add service</button>}
      />
      <div className="toolbar">
        <label className="search-input"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search services, URLs, servers…" aria-label="Search services" /></label>
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {statuses.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
        </select>
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} aria-label="Filter by category">
          <option value="">All categories</option>
          {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
        </select>
      </div>
      {!services.length ? (
        <EmptyState
          icon={<Boxes size={25} />}
          title={filtered ? "No matching services" : servers.length ? "No services yet" : "Add a server first"}
          description={filtered ? "Try clearing a filter or using a broader search." : servers.length ? "Add the applications and endpoints that run across your servers." : "Every service belongs to a server, so start by creating your first server."}
          action={filtered
            ? <button className="button secondary" onClick={() => { setSearch(""); setStatus(""); setCategoryId(""); }}>Clear filters</button>
            : servers.length
              ? <button className="button primary" onClick={() => setCreateOpen(true)}><Plus size={17} /> Add first service</button>
              : <Link className="button primary" to="/servers"><Plus size={17} /> Add server</Link>}
        />
      ) : (
        <div className="table-shell services-table-shell">
          <table className="data-table services-table">
            <thead><tr><th>Service</th><th>Status</th><th>Server</th><th>Category</th><th>Endpoint</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {services.map((service) => (
                <tr key={service.id}>
                  <td data-label="Service"><div className="table-primary"><span className="row-icon service"><Boxes size={16} /></span><span><strong>{service.name}</strong><small>{service.description || "No description"}</small></span></div></td>
                  <td data-label="Status"><StatusBadge status={service.status} /></td>
                  <td data-label="Server"><Link className="inline-link" to={`/servers/${service.serverId}`}><ServerIcon size={14} />{service.serverName}</Link></td>
                  <td data-label="Category">{service.category ? <span className="category-pill"><i style={{ background: service.category.color }} />{service.category.name}</span> : <span className="muted">Uncategorized</span>}</td>
                  <td data-label="Endpoint">{service.url ? <a className="endpoint-link" href={service.url} target="_blank" rel="noreferrer"><span>{service.url.replace(/^https?:\/\//, "")}</span><ExternalLink size={14} /></a> : service.port ? <span className="mono">:{service.port}</span> : <span className="muted">—</span>}</td>
                  <td className="table-actions"><button className="icon-button compact" onClick={() => setEditing(service)} aria-label={`Edit ${service.name}`}><Pencil size={16} /></button><button className="icon-button compact danger-hover" onClick={() => setDeleting(service)} aria-label={`Delete ${service.name}`}><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add service" description="Attach a service or application to one of your servers." size="large">
        <ServiceForm servers={servers} categories={categories} onCancel={() => setCreateOpen(false)} onSubmit={(input) => createMutation.mutateAsync(input)} />
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit service" description={editing ? `Update ${editing.name}'s details and status.` : ""} size="large">
        {editing && <ServiceForm service={editing} servers={servers} categories={categories} onCancel={() => setEditing(null)} onSubmit={(input) => updateMutation.mutateAsync({ id: editing.id, input })} />}
      </Modal>
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleting && deleteMutation.mutate(deleting.id)} busy={deleteMutation.isPending} title={`Delete ${deleting?.name || "service"}?`} description="This removes the service from Vaultboard. The server itself will not be changed." />
    </div>
  );
}
