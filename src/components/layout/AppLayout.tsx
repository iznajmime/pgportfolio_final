import { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { UserNav } from './UserNav';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/clients', label: 'Clients' },
  { href: '/trades', label: 'Trades' },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <div className="min-h-screen w-full relative bg-gradient-background">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-black/30 backdrop-blur-lg">
        <div className="container flex h-16 items-center">
          {/* Corrected Logo */}
          <NavLink to="/" className="mr-8 flex items-center gap-2 text-xl font-semibold text-white pl-4">
            <span>PGPortfolio</span>
          </NavLink>

          {/* Corrected Navigation */}
          <nav className="flex flex-1 items-center gap-4 text-sm font-medium lg:gap-6">
            {navItems.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                className={cn(
                  'transition-colors font-semibold text-white hover:text-white/70',
                  // Use home route for exact match, others for startsWith
                  (item.href === '/' ? location.pathname === item.href : location.pathname.startsWith(item.href)) 
                    ? 'underline' 
                    : ''
                )}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* UserNav with right-side padding */}
          <div className="flex items-center gap-4 pr-4">
            <UserNav />
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        {children}
      </main>
    </div>
  );
}
