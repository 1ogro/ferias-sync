import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Person } from '@/lib/types';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  person: Person | null;
  loading: boolean;
  profileChecked: boolean;
  contractDateChecked: boolean;
  userRoles: string[];
  hasRole: (role: string) => boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, personId: string) => Promise<{ error: any }>;
  signInWithFigma: () => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  createProfile: (personId: string) => Promise<{ error: any }>;
  fetchPersonData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileChecked, setProfileChecked] = useState(false);
  const [contractDateChecked, setContractDateChecked] = useState(false);
  const [userRoles, setUserRoles] = useState<string[]>([]);

  const fetchUserRoles = async (userId: string) => {
    try {
      console.log('Fetching user roles for user:', userId);
      
      const { data, error } = await supabase
        .from('user_roles' as any)
        .select('role')
        .eq('user_id', userId);

      if (error) {
        console.error('Error fetching user roles:', error);
        setUserRoles([]);
      } else {
        const roles = (data as any)?.map((r: any) => r.role) || [];
        console.log('User roles:', roles);
        setUserRoles(roles);
      }
    } catch (error) {
      console.error('Error fetching user roles:', error);
      setUserRoles([]);
    }
  };

  const fetchPersonData = async (userId?: string) => {
    const userIdToUse = userId || user?.id;
    if (!userIdToUse) return;
    
    try {
      console.log('Fetching person data for user:', userIdToUse);
      
      const { data: profile, error } = await supabase
        .from('profiles')
        .select(`
          person_id,
          people!inner(*)
        `)
        .eq('user_id', userIdToUse)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        setPerson(null);
      } else if (profile?.people) {
        console.log('Profile found:', profile.people);
        setPerson(profile.people as Person);
        
        // Fetch user roles after getting person data
        await fetchUserRoles(userIdToUse);
      } else {
        console.log('No profile found for user');
        setPerson(null);
      }
    } catch (error) {
      console.error('Error fetching person data:', error);
      setPerson(null);
    } finally {
      setProfileChecked(true);
      setContractDateChecked(true);
      setLoading(false);
    }
  };

  const hasRole = (role: string) => {
    return userRoles.includes(role);
  };

  useEffect(() => {
    let mounted = true;
    let timeoutId: NodeJS.Timeout;
    
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          fetchPersonData(session.user.id);
        } else {
          setPerson(null);
          setProfileChecked(true);
          setLoading(false);
        }
      }
    );

    // Get initial session with timeout
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (!mounted) return;
        
        if (error) {
          console.error('Auth initialization error:', error);
          setLoading(false);
          setProfileChecked(true);
          setContractDateChecked(true);
          return;
        }
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          await fetchPersonData(session.user.id);
        } else {
          setLoading(false);
          setProfileChecked(true);
          setContractDateChecked(true);
        }
      } catch (error) {
        console.error('Failed to initialize auth:', error);
        if (mounted) {
          setLoading(false);
          setProfileChecked(true);
          setContractDateChecked(true);
        }
      }
    };

    // Set timeout for auth initialization
    timeoutId = setTimeout(() => {
      if (mounted && loading) {
        console.warn('Auth initialization timeout');
        setLoading(false);
        setProfileChecked(true);
        setContractDateChecked(true);
      }
    }, 10000); // 10 second timeout

    initializeAuth();

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string, personId: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });

    if (!error && data.user) {
      // Create profile linking user to person
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          user_id: data.user.id,
          person_id: personId
        });
      
      if (profileError) {
        console.error('Error creating profile:', profileError);
      }
    }

    return { error };
  };

  const signInWithFigma = async () => {
    const redirectUrl = `${window.location.origin}/auth/callback/figma`;
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'figma',
      options: {
        redirectTo: redirectUrl
      }
    });

    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setPerson(null);
    setUserRoles([]);
    setProfileChecked(false);
    setContractDateChecked(false);
  };

  const createProfile = async (personId: string) => {
    if (!user) {
      return { error: 'User not authenticated' };
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .insert({
          user_id: user.id,
          person_id: personId
        });

      if (error) {
        console.error('Error creating profile:', error);
        return { error };
      }

      // Fetch person data after creating profile
      await fetchPersonData(user.id);
      return { error: null };
    } catch (error) {
      console.error('Error creating profile:', error);
      return { error };
    }
  };

  const value = {
    user,
    session,
    person,
    loading,
    profileChecked,
    contractDateChecked,
    userRoles,
    hasRole,
    signIn,
    signUp,
    signInWithFigma,
    signOut,
    createProfile,
    fetchPersonData,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};