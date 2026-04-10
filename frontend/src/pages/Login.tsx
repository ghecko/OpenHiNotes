import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { authApi } from '@/api/auth';
import { OIDCProviderInfo } from '@/types';
import { LogIn, Mail, Lock, AlertCircle } from 'lucide-react';

/** Map well-known provider slugs to display-friendly icon names. */
const PROVIDER_ICONS: Record<string, string> = {
  google: 'G',
  microsoft: 'M',
  'entra-id': 'M',
  keycloak: 'K',
  okta: 'O',
  auth0: 'A',
};

function SSOButton({
  provider,
  onClick,
  disabled,
}: {
  provider: OIDCProviderInfo;
  onClick: () => void;
  disabled: boolean;
}) {
  const letter = PROVIDER_ICONS[provider.slug] || provider.display_name.charAt(0).toUpperCase();

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-white dark:bg-gray-700/50 border border-gray-200/60 dark:border-gray-600/40 rounded-xl text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200 disabled:opacity-50"
    >
      <span className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 flex items-center justify-center text-xs font-bold">
        {letter}
      </span>
      Continue with {provider.display_name}
    </button>
  );
}

export function Login() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { login, loginWithSSO, error: authError, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<OIDCProviderInfo[]>([]);
  const [ssoLoading, setSSOLoading] = useState(false);

  // Fetch OIDC providers on mount
  useEffect(() => {
    authApi.getOIDCProviders().then(setProviders).catch(() => {
      // Silently fail — SSO buttons just won't appear
    });
  }, []);

  // Handle SSO token from callback redirect
  useEffect(() => {
    const ssoToken = searchParams.get('sso_token');
    const ssoError = searchParams.get('sso_error');
    const ssoErrorDesc = searchParams.get('sso_error_description');

    if (ssoToken) {
      // Clean URL params
      setSearchParams({}, { replace: true });
      setSSOLoading(true);
      loginWithSSO(ssoToken)
        .then(() => {
          // Check if force password reset is needed
          const state = useAuthStore.getState();
          if (state.forcePasswordReset) {
            navigate('/change-password');
          } else {
            navigate('/dashboard');
          }
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'SSO login failed');
        })
        .finally(() => setSSOLoading(false));
    } else if (ssoError) {
      setSearchParams({}, { replace: true });
      const desc = ssoErrorDesc ? decodeURIComponent(ssoErrorDesc) : '';
      if (ssoError === 'account_pending') {
        setError(desc || 'Your account is pending admin approval.');
      } else if (ssoError === 'account_inactive') {
        setError(desc || 'Your account has been deactivated.');
      } else if (ssoError === 'auth_failed') {
        setError(desc || 'Authentication failed. Please try again.');
      } else {
        setError(desc || `SSO error: ${ssoError}`);
      }
    }
  }, [searchParams, setSearchParams, loginWithSSO, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    clearError();

    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setIsLoading(true);

    try {
      await login(email, password);
      // Check if force password reset is needed (read fresh state)
      const state = useAuthStore.getState();
      if (state.forcePasswordReset) {
        navigate('/change-password');
        return;
      }
      navigate('/dashboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSSO = async (slug: string) => {
    setError(null);
    clearError();
    setSSOLoading(true);

    try {
      const { authorize_url } = await authApi.startOIDCAuth(slug);
      // Redirect to the OIDC provider
      window.location.href = authorize_url;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start SSO';
      setError(message);
      setSSOLoading(false);
    }
  };

  const displayError = error || authError;
  const anyLoading = isLoading || ssoLoading;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-600 via-primary-700 to-primary-900 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary-400/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/20 dark:border-gray-700/40">
          {/* Brand */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 shadow-lg shadow-primary-500/25 mb-4">
              <LogIn className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              OpenHiNotes
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
              Sign in to your account
            </p>
          </div>

          {displayError && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200/60 dark:border-red-800/40 text-red-700 dark:text-red-300 rounded-xl text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-500" />
              <span>{displayError}</span>
            </div>
          )}

          {/* SSO Buttons */}
          {providers.length > 0 && (
            <div className="mb-6">
              <div className="space-y-2">
                {providers.map((p) => (
                  <SSOButton
                    key={p.slug}
                    provider={p}
                    onClick={() => handleSSO(p.slug)}
                    disabled={anyLoading}
                  />
                ))}
              </div>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200/60 dark:border-gray-700/40" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-3 bg-white/90 dark:bg-gray-800/90 text-gray-500 dark:text-gray-400">
                    Or sign in with email
                  </span>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={anyLoading}
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-700/50 text-gray-900 dark:text-white border border-gray-200/60 dark:border-gray-600/40 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 disabled:opacity-50 transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  placeholder="your@email.com"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={anyLoading}
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-700/50 text-gray-900 dark:text-white border border-gray-200/60 dark:border-gray-600/40 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 disabled:opacity-50 transition-all duration-200 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={anyLoading}
              className="w-full px-4 py-2.5 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-medium rounded-xl transition-all duration-200 disabled:opacity-50 shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30 mt-2"
            >
              {isLoading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : ssoLoading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Connecting...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-200/60 dark:border-gray-700/40 text-center text-sm text-gray-600 dark:text-gray-400">
            Don't have an account?{' '}
            <Link
              to="/register"
              className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium transition-colors duration-200"
            >
              Create one
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
