import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import {
  FileText,
  Shield,
  Users as UsersIcon,
  UserPlus,
  Plug,
  KeyRound,
  Mail,
  SlidersHorizontal,
} from 'lucide-react';

import { Templates } from './Templates';
import { Users } from './Users';
import { Groups } from './Groups';
import { RegistrationSettingsPage } from './RegistrationSettings';
import { ApiSettings } from './ApiSettings';
import { FeatureSettings } from './FeatureSettings';
import { OIDCSettings } from './OIDCSettings';
import { EmailSettings } from './EmailSettings';

type AdminTab = 'users' | 'groups' | 'templates' | 'registration' | 'sso' | 'email' | 'features' | 'api';

const tabs: { key: AdminTab; label: string; icon: typeof Shield }[] = [
  { key: 'users', label: 'Users', icon: Shield },
  { key: 'groups', label: 'Groups', icon: UsersIcon },
  { key: 'templates', label: 'Templates', icon: FileText },
  { key: 'registration', label: 'Registration', icon: UserPlus },
  { key: 'sso', label: 'SSO / OIDC', icon: KeyRound },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'features', label: 'Features', icon: SlidersHorizontal },
  { key: 'api', label: 'API Settings', icon: Plug },
];

export function AdminPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as AdminTab) || 'users';
  const [activeTab, setActiveTab] = useState<AdminTab>(
    tabs.some((t) => t.key === initialTab) ? initialTab : 'users'
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
    <Layout title="Administration">
      <div className="space-y-6">
        {/* Tab navigation */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex gap-1 -mb-px overflow-x-auto" aria-label="Admin tabs">
            {tabs.map(({ key, label, icon: Icon }) => {
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
