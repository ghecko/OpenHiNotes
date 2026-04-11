import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface LayoutProps {
  children: ReactNode;
  title?: string;
}

export function Layout({ children, title }: LayoutProps) {
  return (
    <div className="flex h-[100dvh] bg-surface dark:bg-surface-darker">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col min-h-0 border-l border-gray-200/60 dark:border-gray-700/40 transition-all duration-300">
        <div className="flex-shrink-0 sticky top-0 z-30">
          <Header title={title} />
        </div>
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-50/50 dark:bg-gray-950/50">
          <div className="p-3 sm:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
