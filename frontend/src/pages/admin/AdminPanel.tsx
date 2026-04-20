import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { useAuthStore } from '@/store/useAuthStore';
import {
  FileText,
  Shield,
  Users as UsersIcon,
  UserPlus,
  Plug,
  KeyRound,
  Mail,
  SlidersHorizontal,
  ClipboardCheck,
} from 'lucide-react';

import { Templates } from './Templates';
import { TemplateReview } from './TemplateReview';
import { Users } from './Users';
import { Groups } from './Groups';
import { RegistrationSettingsPage } from './RegistrationSettings';
import { ApiSettings } from './ApiSettings';
import { FeatureSettings } from './FeatureSettings';
import { OIDCSettings } from './OIDCSettings';
import { EmailSettings } from './EmailSettings';

type AdminTab =
  | 'users'
  | 'groups'
  | 'templates'
  | 'template-review'
  | 'registration'
  | 'sso'
  | 'email'
  | 'features'
  | 'api';

const tabs: { key: AdminTab; label: string; icon: typeof Shield }[] = [
  { key: 'users', label: 'Users', icon: Shield },
  { key: 'groups', label: 'Groups', icon: UsersIcon },
  { key: 'templates', label: 'Templates', icon: FileText },
  { key: 'template-review', label: 'Template review', icon: ClipboardCheck },
  { key: 'registration', label: 'Registration', icon: UserPlus },
  { key: 'sso', label: 'SSO / OIDC', icon: KeyRound },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'features', label: 'Features', icon: SlidersHorizontal },
  { key: 'api', label: 'API Settings', icon: Plug },
];

// Tabs visible to a scoped ``template_manager``. A template_manager uses
// the same AdminPanel UI but only sees template-related tabs.
const TEMPLATE_MANAGER_TABS: AdminTab[] = ['templates', 'template-review'];

export function AdminPanel() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const visibleTabs = useMemo(
    () =>
      isAdmin
        ? tabs
        : tabs.filter((t) => TEMPLATE_MANAGER_TABS.includes(t.key)),
    [isAdmin],
  );
  const defaultTab: AdminTab = isAdmin ? 'users' : 'template-review';

  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as AdminTab) || defaultTab;
  const [activeTab, setActiveTab] = useState<AdminTab>(
    visibleTabs.some((t) => t.key === initialTab) ? initialTab : defaultTab
  );

  const handleTabChange = (tab: AdminTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'users':
        return <Users embedded />;
      case 'groups':
        return <Groups embedded />;
      case 'templates':
        return <Templates embedded />;
      case 'template-review':
        return <TemplateReview embedded />;
      case 'registration':
        return <RegistrationSettingsPage embedded />;
      case 'sso':
        return <OIDCSettings embedded />;
      case 'email':
        return <EmailSettings embedded />;
      case 'features':
        return <FeatureSettings embedded />;
      case 'api':
        return <ApiSettings embedded />;
      default:
        return <Users embedded />;
    }
  };

  return (
    <Layout title={isAdmin ? 'Administration' : 'Template management'}>
      <div className="space-y-6">
        {/* Tab navigation */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex gap-1 -mb-px overflow-x-auto" aria-label="Admin tabs">
            {visibleTabs.map(({ key, label, icon: Icon }) => {
              const isActive = activeTab === key;
              return (
                <button
                  key={key}
                  onClick={() => handleTabChange(key)}
                  className={`group inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all duration-200 whitespace-nowrap ${
                    isActive
                      ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 transition-colors duration-200 ${
                      isActive
                        ? 'text-primary-500 dark:text-primary-400'
                        : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400'
                    }`}
                  />
                  {label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab content */}
        <div>{renderContent()}</div>
      </div>
    </Layout>
  );
}
