import { ArrowLeft, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import type { ServiceStatus, Tag } from "../types";

export function PageHeader({ eyebrow, title, description, actions, backTo }: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  backTo?: string;
}) {
  return (
    <header className="page-header">
      <div className="page-heading">
        {backTo && <Link className="back-link" to={backTo}><ArrowLeft size={16} /> Back</Link>}
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

const statusLabels: Record<ServiceStatus, string> = {
  operational: "Operational",
  degraded: "Degraded",
  down: "Down",
  maintenance: "Maintenance",
  unknown: "Unknown",
};

export function StatusBadge({ status }: { status: ServiceStatus }) {
  return <span className={`status-badge status-${status}`}><span />{statusLabels[status]}</span>;
}

export function TagPills({ tags, limit }: { tags: Tag[]; limit?: number }) {
  const visible = limit ? tags.slice(0, limit) : tags;
  return (
    <div className="tag-row">
      {visible.map((tag) => <span className="tag-pill" style={{ "--tag-color": tag.color } as React.CSSProperties} key={tag.id}>{tag.name}</span>)}
      {limit && tags.length > limit && <span className="tag-more">+{tags.length - limit}</span>}
    </div>
  );
}

export function OpenLink({ href, label = "Open" }: { href: string; label?: string }) {
  if (!href) return null;
  return <a className="open-link" href={href} target="_blank" rel="noreferrer"><ExternalLink size={14} />{label}</a>;
}

export function FieldError({ message }: { message?: string }) {
  return message ? <span className="field-error">{message}</span> : null;
}

export function DistributionBars({ items }: { items: { name: string; count: number; color?: string }[] }) {
  const maximum = Math.max(...items.map((item) => Number(item.count)), 1);
  if (!items.length) return <p className="muted compact-copy">Data will appear here as your inventory grows.</p>;
  return (
    <div className="distribution-list">
      {items.map((item, index) => (
        <div className="distribution-item" key={item.name}>
          <div className="distribution-label"><span>{item.name}</span><strong>{item.count}</strong></div>
          <div className="distribution-track"><span style={{ width: `${Math.max((item.count / maximum) * 100, 5)}%`, background: item.color || `var(--chart-${(index % 4) + 1})` }} /></div>
        </div>
      ))}
    </div>
  );
}
