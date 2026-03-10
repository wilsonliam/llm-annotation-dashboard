import { NavLink, Outlet } from 'react-router-dom'
import { BarChart2, Table2, Search, Shield, Activity, Layers } from 'lucide-react'

const navItems = [
  { to: '/', label: 'Pareto Fronts', icon: BarChart2 },
  { to: '/details', label: 'Model Details', icon: Table2 },
  { to: '/visits', label: 'Visit Explorer', icon: Search },
  { to: '/conformal', label: 'Conformal', icon: Shield },
  { to: '/semantic', label: 'Semantic Entropy', icon: Layers },
]

export function Layout() {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-56 flex-shrink-0 border-r border-border bg-surface flex flex-col">
        <div className="flex items-center gap-2 px-4 py-5 border-b border-border">
          <Activity size={20} className="text-blue-400" />
          <span className="font-semibold text-foreground text-sm leading-tight">
            LLM Annotator
            <br />
            Dashboard
          </span>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-500/20 text-blue-400 font-medium'
                    : 'text-muted hover:text-foreground hover:bg-white/5'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-border text-xs text-muted">
          MIMIC-IV ICU · 20 visits
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
