import { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Session, User, AuthError, SignUpWithPasswordCredentials } from '@supabase/supabase-js';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signUp: (credentials: SignUpWithPasswordCredentials) => Promise<{ user: User | null; error: AuthError | null }>;
  signIn: (credentials: SignUpWithPasswordCredentials) => Promise<{ session: Session | null; error: AuthError | null }>;
  signOut: () => Promise<{ error: AuthError | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // This function will now be our single source of truth for the session
    const setAuthData = (session: Session | null) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false); // We only stop loading once we have a definitive answer
    };

    // Immediately check for the session when the app loads
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthData(session);
    });

    // Listen for any changes in auth state (login, logout, token refresh)
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthData(session);
    });

    // Cleanup the listener when the component unmounts
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // The rest of the functions remain the same
  const signUp = async (credentials: SignUpWithPasswordCredentials) => {
    const { data, error } = await supabase.auth.signUp(credentials);
    return { user: data.user, error };
  };

  const signIn = async (credentials: SignUpWithPasswordCredentials) => {
    const { data, error } = await supabase.auth.signInWithPassword(credentials);
    // The onAuthStateChange listener will handle setting the session state
    return { session: data.session, error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    // The onAuthStateChange listener will handle clearing the session state
    return { error };
  };

  const value = {
    session,
    user,
    loading,
    signUp,
    signIn,
    signOut,
  };

  // Do not render children until the initial session check is complete
  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
