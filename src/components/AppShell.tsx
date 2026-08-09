import {
  Boxes,
  Command,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Search,
  Server,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";

const navigation = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/servers", label: "Servers", icon: Server },
  { to: "/services", label: "Services", icon: Boxes },
  { to: "/search", label: "Search", icon: Search },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const { resolved, setTheme } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        navigate("/search");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [navigate]);

  const initials = user?.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "VB";
  return (
    <div className="app-shell">
      {mobileOpen && <button className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark"><span>V</span></div>
          <div><strong>Vaultboard</strong><small>Infrastructure hub</small></div>
          <button className="icon-button sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={19} /></button>
        </div>
        <nav className="sidebar-nav" aria-label="Primary navigation">
          <span className="nav-section-label">Workspace</span>
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink to={to} end={end} key={to} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <Icon size={19} strokeWidth={1.8} /><span>{label}</span>
            </NavLink>
          ))}
          <span className="nav-section-label lower">Manage</span>
          <NavLink to="/settings" onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
            <Settings size={19} strokeWidth={1.8} /><span>Settings</span>
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <button className="theme-toggle" onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}>
            {resolved === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            <span>{resolved === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
          <div className="account-card">
            <span className="avatar">{initials}</span>
            <div><strong>{user?.displayName}</strong><small>{user?.email}</small></div>
            <button className="icon-button compact" onClick={() => logout()} aria-label="Sign out" title="Sign out"><LogOut size={17} /></button>
          </div>
        </div>
      </aside>
      <div className="app-column">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
          <button className="global-search" onClick={() => navigate("/search")}>
            <Search size={17} /><span>Search servers and services…</span><kbd><Command size={12} /> K</kbd>
          </button>
          <button className="topbar-theme" onClick={() => setTheme(resolved === "dark" ? "light" : "dark")} aria-label={`Use ${resolved === "dark" ? "light" : "dark"} mode`}>
            {resolved === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <span className="topbar-avatar avatar">{initials}</span>
        </header>
        <main className="main-content">{children}</main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navigation.slice(0, 3).map(({ to, label, icon: Icon, end }) => (
          <NavLink to={to} end={end} key={to} className={({ isActive }) => (isActive ? "active" : "")}>
            <Icon size={20} /><span>{label}</span>
          </NavLink>
        ))}
        <NavLink to="/settings" className={({ isActive }) => (isActive ? "active" : "")}>
          <Settings size={20} /><span>Settings</span>
        </NavLink>
      </nav>
    </div>
  );
}
