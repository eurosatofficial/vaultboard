import { AlertTriangle, Inbox, LoaderCircle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

export function FullPageLoader() {
  return (
    <div className="full-page-loader">
      <div className="brand-mark"><span>V</span></div>
      <LoaderCircle className="spin" size={24} aria-hidden="true" />
      <span className="sr-only">Loading Vaultboard</span>
    </div>
  );
}

export function PageSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="page-skeleton" aria-label="Loading content" aria-busy="true">
      <div className="skeleton skeleton-title" />
      <div className="skeleton-grid">
        {Array.from({ length: cards }, (_, index) => <div className="skeleton skeleton-card" key={index} />)}
      </div>
      <div className="skeleton skeleton-panel" />
    </div>
  );
}

export function ErrorState({ message = "We couldn't load this page.", onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="state-card error-state" role="alert">
      <div className="state-icon error"><AlertTriangle size={24} /></div>
      <h2>Something went wrong</h2>
      <p>{message}</p>
      {onRetry && <button className="button secondary" onClick={onRetry}><RefreshCw size={16} /> Try again</button>}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="state-card empty-state">
      <div className="state-icon">{icon || <Inbox size={24} />}</div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
