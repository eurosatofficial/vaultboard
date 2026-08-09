import { Boxes, Cpu, ExternalLink, Globe2, MapPin, Network, Pencil, Plus, Server as ServerIcon, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ConfirmDialog, Modal } from "../components/Modal";
import { ServerForm } from "../components/ServerForm";
import { ServiceForm } from "../components/ServiceForm";
import { EmptyState, ErrorState, PageSkeleton } from "../components/States";
import { PageHeader, StatusBadge, TagPills } from "../components/UI";
import { useToast } from "../components/Toast";
import { api, jsonBody } from "../lib/api";
import type { Category, Server, ServerInput, Service, ServiceInput, Tag } from "../types";

export function ServerDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { showToast } = useToast();
  const [editServer, setEditServer] = useState(false);
  const [deleteServer, setDeleteServer] = useState(false);
  const [createService, setCreateService] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [deletingService, setDeletingService] = useState<Service | null>(null);
  const serverQuery = useQuery({ queryKey: ["server", id], queryFn: () => api<Server>(`/api/servers/${id}`), retry: false });
  const tagsQuery = useQuery({ queryKey: ["tags"], queryFn: () => api<{ tags: Tag[] }>("/api/tags") });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: () => api<{ categories: Category[] }>("/api/categories") });
  const serversQuery = useQuery({ queryKey: ["servers", "all-for-form"], queryFn: () => api<{ servers: Server[] }>("/api/servers") });
  const invalidate = () => Promise.all([
    client.invalidateQueries({ queryKey: ["server", id] }),
    client.invalidateQueries({ queryKey: ["servers"] }),
    client.invalidateQueries({ queryKey: ["services"] }),
    client.invalidateQueries({ queryKey: ["dashboard"] }),
  ]);
  const updateServerMutation = useMutation({
    mutationFn: (input: ServerInput) => api<Server>(`/api/servers/${id}`, { method: "PUT", body: jsonBody(input) }),
    onSuccess: async () => { await invalidate(); setEditServer(false); showToast("Server updated"); },
  });
  const deleteServerMutation = useMutation({
    mutationFn: () => api<void>(`/api/servers/${id}`, { method: "DELETE" }),
    onSuccess: async () => { await invalidate(); showToast("Server deleted"); navigate("/servers", { replace: true }); },
    onError: (error) => showToast(error.message, "error"),
  });
  const createServiceMutation = useMutation({
    mutationFn: (input: ServiceInput) => api<Service>("/api/services", { method: "POST", body: jsonBody(input) }),
    onSuccess: async () => { await invalidate(); setCreateService(false); showToast("Service added"); },
  });
  const updateServiceMutation = useMutation({
    mutationFn: ({ serviceId, input }: { serviceId: string; input: ServiceInput }) => api<Service>(`/api/services/${serviceId}`, { method: "PUT", body: jsonBody(input) }),
    onSuccess: async () => { await invalidate(); setEditingService(null); showToast("Service updated"); },
  });
  const deleteServiceMutation = useMutation({
    mutationFn: (serviceId: string) => api<void>(`/api/services/${serviceId}`, { method: "DELETE" }),
    onSuccess: async () => { await invalidate(); setDeletingService(null); showToast("Service deleted"); },
    onError: (error) => showToast(error.message, "error"),
  });

  if (serverQuery.isLoading || tagsQuery.isLoading || categoriesQuery.isLoading || serversQuery.isLoading) return <PageSkeleton cards={3} />;
  if (serverQuery.isError) return <ErrorState message={serverQuery.error.message} onRetry={() => serverQuery.refetch()} />;
  const server = serverQuery.data!;
  const tags = tagsQuery.data?.tags || [];
  const categories = categoriesQuery.data?.categories || [];
  const servers = serversQuery.data?.servers || [server];
  const services = server.services || [];
  return (
    <div className="page">
      <PageHeader
        backTo="/servers"
        eyebrow={server.provider || "Server"}
        title={server.name}
        description={server.hostname || server.ipAddress || "No network address configured"}
        actions={<><button className="button secondary" onClick={() => setEditServer(true)}><Pencil size={16} /> Edit</button><button className="button primary" onClick={() => setCreateService(true)}><Plus size={17} /> Add service</button></>}
      />
      <div className="detail-hero panel">
        <div className="detail-server-icon"><ServerIcon size={29} /></div>
        <div className="detail-summary"><span>Server profile</span><strong>{server.operatingSystem || "Operating system not set"}</strong><TagPills tags={server.tags || []} /></div>
        <div className="detail-count"><strong>{server.serviceCount}</strong><span>{server.serviceCount === 1 ? "service" : "services"}</span></div>
      </div>
      <section className="detail-layout">
        <div className="detail-main">
          <article className="panel detail-panel">
            <div className="panel-heading"><div><span className="panel-eyebrow">Configuration</span><h2>Server details</h2></div></div>
            <div className="info-grid">
              <div className="info-item"><span className="info-icon"><Network size={17} /></span><div><small>Hostname</small><strong className="mono">{server.hostname || "—"}</strong></div></div>
              <div className="info-item"><span className="info-icon"><Globe2 size={17} /></span><div><small>IP address</small><strong className="mono">{server.ipAddress || "—"}</strong></div></div>
              <div className="info-item"><span className="info-icon"><Cpu size={17} /></span><div><small>Operating system</small><strong>{server.operatingSystem || "—"}</strong></div></div>
              <div className="info-item"><span className="info-icon"><ServerIcon size={17} /></span><div><small>Provider</small><strong>{server.provider || "—"}</strong></div></div>
              <div className="info-item span-2"><span className="info-icon"><MapPin size={17} /></span><div><small>Location</small><strong>{server.location || "—"}</strong></div></div>
            </div>
          </article>
          <article className="panel detail-panel services-panel">
            <div className="panel-heading"><div><span className="panel-eyebrow">Applications</span><h2>Services on this server</h2></div><button className="button ghost small" onClick={() => setCreateService(true)}><Plus size={15} /> Add service</button></div>
            {services.length ? (
              <div className="detail-services-list">
                {services.map((service) => (
                  <div className="detail-service-row" key={service.id}>
                    <span className="row-icon service"><Boxes size={17} /></span>
                    <div className="service-main"><strong>{service.name}</strong><small>{service.description || service.category?.name || `Port ${service.port || "—"}`}</small></div>
                    <StatusBadge status={service.status} />
                    {service.url && <a className="icon-button compact" href={service.url} target="_blank" rel="noreferrer" aria-label={`Open ${service.name}`}><ExternalLink size={16} /></a>}
                    <button className="icon-button compact" onClick={() => setEditingService(service)} aria-label={`Edit ${service.name}`}><Pencil size={16} /></button>
                    <button className="icon-button compact danger-hover" onClick={() => setDeletingService(service)} aria-label={`Delete ${service.name}`}><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            ) : <EmptyState icon={<Boxes size={24} />} title="No services on this server" description="Add an application, endpoint, database, or other service running here." action={<button className="button secondary small" onClick={() => setCreateService(true)}>Add service</button>} />}
          </article>
        </div>
        <aside className="detail-aside">
          <article className="panel detail-panel notes-panel">
            <div className="panel-heading"><div><span className="panel-eyebrow">Reference</span><h2>Notes</h2></div></div>
            {server.notes ? <p className="server-notes">{server.notes}</p> : <p className="muted">No notes have been added for this server.</p>}
          </article>
          <article className="panel danger-zone">
            <h2>Danger zone</h2><p>Deleting this server also removes all attached services.</p>
            <button className="button danger subtle" onClick={() => setDeleteServer(true)}><Trash2 size={16} /> Delete server</button>
          </article>
        </aside>
      </section>
      <Modal open={editServer} onClose={() => setEditServer(false)} title="Edit server" description={`Update ${server.name}'s inventory details.`} size="large">
        <ServerForm server={server} tags={tags} onCancel={() => setEditServer(false)} onSubmit={(input) => updateServerMutation.mutateAsync(input)} />
      </Modal>
      <Modal open={createService} onClose={() => setCreateService(false)} title="Add service" description={`Attach a service to ${server.name}.`} size="large">
        <ServiceForm servers={servers} categories={categories} defaultServerId={server.id} onCancel={() => setCreateService(false)} onSubmit={(input) => createServiceMutation.mutateAsync(input)} />
      </Modal>
      <Modal open={!!editingService} onClose={() => setEditingService(null)} title="Edit service" description={editingService ? `Update ${editingService.name}'s details.` : ""} size="large">
        {editingService && <ServiceForm service={editingService} servers={servers} categories={categories} onCancel={() => setEditingService(null)} onSubmit={(input) => updateServiceMutation.mutateAsync({ serviceId: editingService.id, input })} />}
      </Modal>
      <ConfirmDialog open={deleteServer} onClose={() => setDeleteServer(false)} onConfirm={() => deleteServerMutation.mutate()} busy={deleteServerMutation.isPending} title={`Delete ${server.name}?`} description={`This permanently deletes the server and all ${server.serviceCount} attached services. This action cannot be undone.`} />
      <ConfirmDialog open={!!deletingService} onClose={() => setDeletingService(null)} onConfirm={() => deletingService && deleteServiceMutation.mutate(deletingService.id)} busy={deleteServiceMutation.isPending} title={`Delete ${deletingService?.name || "service"}?`} description="This removes the service from Vaultboard without changing the underlying server." />
    </div>
  );
}
