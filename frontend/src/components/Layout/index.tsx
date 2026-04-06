import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface LayoutProps {
  children: ReactNode;
  title?: string;
}

export function Layout({ children, title }: LayoutProps) {
  return (
    <div className="flex h-screen bg-surface dark:bg-surface-darker">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden border-l border-gray-200/60 dark:border-gray-700/40 transition-all duration-300">
        <Header title={title} />
        <main className="flex-1 overflow-auto bg-gray-50/50 dark:bg-gray-950/50">
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
