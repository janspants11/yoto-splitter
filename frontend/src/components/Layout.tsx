interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-forest-800 text-cream font-body">
      {/* Amber decorative top line */}
      <div className="h-[2px] bg-gradient-to-r from-transparent via-amber to-transparent" />

      <header className="border-b border-forest-600">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <h1 className="font-display text-2xl tracking-wide">
            yoto<span className="text-amber mx-0.5">&middot;</span>splitter
          </h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
