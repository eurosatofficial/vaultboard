import { Activity, ArrowRight, Boxes, CircleAlert, Plus, Server, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { Server as ServerType, Service } from "../types";
import { DistributionBars, PageHeader, StatusBadge } from "../components/UI";
import { EmptyState, ErrorState, PageSkeleton } from "../components/States";

interface DashboardData {
  counts: { servers: number; services: number; operational: number; attention: number };
  servicesByCategory: { name: string; color: string; count: number }[];
  serversByProvider: { name: string; count: number }[];
  recentServers: ServerType[];
  recentServices: Service[];
}

export function DashboardPage() {
  const query = useQuery({ queryKey: ["dashboard"], queryFn: () => api<DashboardData>("/api/dashboard") });
  if (query.isLoading) return <PageSkeleton />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => query.refetch()} />;
  const data = query.data!;
  const firstRun = data.counts.servers === 0;
  return (
    <div className="page dashboard-page">
      <PageHeader
        eyebrow="Command center"
        title="Infrastructure overview"
        description="A live inventory of the systems and services you depend on."
        actions={<Link className="button primary" to="/servers"><Plus size={17} /> Add server</Link>}
      />
      {firstRun && (
        <div className="welcome-banner">
          <div className="welcome-icon"><Sparkles size={22} /></div>
          <div><strong>Your workspace is ready.</strong><p>Add your first server, then attach the services it runs.</p></div>
          <Link className="button on-accent" to="/servers">Add your first server <ArrowRight size={16} /></Link>
        </div>
      )}
      <section className="stat-grid" aria-label="Infrastructure statistics">
        <article className="stat-card">
          <div className="stat-icon blue"><Server size={20} /></div>
          <div><span>Servers</span><strong>{data.counts.servers}</strong><small>in your inventory</small></div>
        </article>
        <article className="stat-card">
          <div className="stat-icon violet"><Boxes size={20} /></div>
          <div><span>Services</span><strong>{data.counts.services}</strong><small>across all servers</small></div>
        </article>
        <article className="stat-card">
          <div className="stat-icon green"><Activity size={20} /></div>
          <div><span>Operational</span><strong>{data.counts.operational}</strong><small>marked healthy</small></div>
        </article>
        <article className="stat-card">
          <div className="stat-icon amber"><CircleAlert size={20} /></div>
          <div><span>Needs attention</span><strong>{data.counts.attention}</strong><small>down or degraded</small></div>
        </article>
      </section>
      <section className="dashboard-grid charts-grid">
        <article className="panel chart-panel">
          <div className="panel-heading"><div><span className="panel-eyebrow">Distribution</span><h2>Services by category</h2></div><Link to="/services">View services <ArrowRight size={14} /></Link></div>
          <DistributionBars items={data.servicesByCategory} />
        </article>
        <article className="panel chart-panel">
          <div className="panel-heading"><div><span className="panel-eyebrow">Footprint</span><h2>Servers by provider</h2></div><Link to="/servers">View servers <ArrowRight size={14} /></Link></div>
          <DistributionBars items={data.serversByProvider} />
        </article>
      </section>
      <section className="dashboard-grid activity-grid">
        <article className="panel list-panel">
          <div className="panel-heading"><div><span className="panel-eyebrow">Recently updated</span><h2>Servers</h2></div><Link to="/servers">All servers <ArrowRight size={14} /></Link></div>
          {data.recentServers.length ? (
            <div className="compact-list">
              {data.recentServers.map((server) => (
                <Link className="compact-row" to={`/servers/${server.id}`} key={server.id}>
                  <span className="row-icon server"><Server size={17} /></span>
                  <span className="row-main"><strong>{server.name}</strong><small>{server.hostname || server.ipAddress || "No address set"}</small></span>
                  <span className="row-meta">{server.serviceCount} {server.serviceCount === 1 ? "service" : "services"}</span>
                  <ArrowRight size={15} />
                </Link>
              ))}
            </div>
          ) : <EmptyState title="No servers yet" description="Add a server to start building your infrastructure map." action={<Link className="button secondary small" to="/servers">Add server</Link>} />}
        </article>
        <article className="panel list-panel">
          <div className="panel-heading"><div><span className="panel-eyebrow">Service inventory</span><h2>Services</h2></div><Link to="/services">All services <ArrowRight size={14} /></Link></div>
          {data.recentServices.length ? (
            <div className="compact-list">
              {data.recentServices.map((service) => (
                <Link className="compact-row" to={`/servers/${service.serverId}`} key={service.id}>
                  <span className="row-icon service"><Boxes size={17} /></span>
                  <span className="row-main"><strong>{service.name}</strong><small>{service.serverName}</small></span>
                  <StatusBadge status={service.status} />
                  <ArrowRight size={15} />
                </Link>
              ))}
            </div>
          ) : <EmptyState title="No services yet" description="Services appear here once they're connected to a server." />}
        </article>
      </section>
    </div>
  );
}
