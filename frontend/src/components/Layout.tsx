import { NavLink } from 'react-router-dom';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-forest-800 text-cream font-body">
      {/* Amber decorative top line */}
      <div className="h-[2px] bg-gradient-to-r from-transparent via-amber to-transparent" />

      <header className="border-b border-forest-600">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="font-display text-2xl tracking-wide">
            yoto<span className="text-amber mx-0.5">&middot;</span>splitter
          </h1>
          <nav className="flex gap-6">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `pb-1 text-sm font-body tracking-wide transition-colors ${
                  isActive
                    ? 'text-amber border-b-2 border-amber'
                    : 'text-cream/60 hover:text-cream'
                }`
              }
            >
              Convert
            </NavLink>
            <NavLink
              to="/jobs"
              className={({ isActive }) =>
                `pb-1 text-sm font-body tracking-wide transition-colors ${
                  isActive
                    ? 'text-amber border-b-2 border-amber'
                    : 'text-cream/60 hover:text-cream'
                }`
              }
            >
              History
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
