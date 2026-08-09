import { ArrowRight, Boxes, Search, Server as ServerIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, ErrorState } from "../components/States";
import { PageHeader, StatusBadge, TagPills } from "../components/UI";
import { api } from "../lib/api";
import type { Server, Service } from "../types";

export function SearchPage() {
  const [query, setQuery] = useState("");
  const search = query.trim();
  const results = useQuery({
    queryKey: ["search", search],
    queryFn: () => api<{ servers: Server[]; services: Service[] }>(`/api/search?q=${encodeURIComponent(search)}`),
    enabled: search.length > 0,
  });
  const total = (results.data?.servers.length || 0) + (results.data?.services.length || 0);
  return (
    <div className="page search-page">
      <PageHeader eyebrow="Find anything" title="Search" description="Search names, addresses, providers, locations, URLs, descriptions, and notes." />
      <label className="search-hero">
        <Search size={22} />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your infrastructure…" aria-label="Search all infrastructure" />
        <kbd>ESC</kbd>
      </label>
      {!search ? (
        <div className="search-hint-grid">
          <div><span className="row-icon server"><ServerIcon size={18} /></span><strong>Find servers</strong><p>Search by name, hostname, address, provider, location, or notes.</p></div>
          <div><span className="row-icon service"><Boxes size={18} /></span><strong>Find services</strong><p>Search across service names, URLs, descriptions, and their servers.</p></div>
        </div>
      ) : results.isLoading ? (
        <div className="search-loading"><span className="button-spinner dark" /> Searching your Vaultboard…</div>
      ) : results.isError ? (
        <ErrorState message={results.error.message} onRetry={() => results.refetch()} />
      ) : total === 0 ? (
        <EmptyState icon={<Search size={24} />} title={`No results for “${search}”`} description="Check the spelling or try a shorter, more general search." />
      ) : (
        <div className="search-results">
          <p className="result-count">{total} {total === 1 ? "result" : "results"} for <strong>“{search}”</strong></p>
          {!!results.data?.servers.length && (
            <section className="result-section">
              <div className="result-section-heading"><span className="row-icon server"><ServerIcon size={17} /></span><h2>Servers</h2><span>{results.data.servers.length}</span></div>
              <div className="result-list">
                {results.data.servers.map((server) => (
                  <Link className="result-row" to={`/servers/${server.id}`} key={server.id}>
                    <span className="row-icon server"><ServerIcon size={18} /></span>
                    <span className="result-main"><strong>{server.name}</strong><small>{[server.hostname || server.ipAddress, server.provider, server.location].filter(Boolean).join(" · ") || "No details set"}</small></span>
                    <TagPills tags={server.tags} limit={2} />
                    <span className="result-meta">{server.serviceCount} services</span><ArrowRight size={16} />
                  </Link>
                ))}
              </div>
            </section>
          )}
          {!!results.data?.services.length && (
            <section className="result-section">
              <div className="result-section-heading"><span className="row-icon service"><Boxes size={17} /></span><h2>Services</h2><span>{results.data.services.length}</span></div>
              <div className="result-list">
                {results.data.services.map((service) => (
                  <Link className="result-row" to={`/servers/${service.serverId}`} key={service.id}>
                    <span className="row-icon service"><Boxes size={18} /></span>
                    <span className="result-main"><strong>{service.name}</strong><small>{service.serverName}{service.url ? ` · ${service.url.replace(/^https?:\/\//, "")}` : ""}</small></span>
                    <StatusBadge status={service.status} /><ArrowRight size={16} />
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
