import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
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

  // Refs to prevent duplicate fetches and stale closures
  const fetchingRef = useRef(false);
  const loadedUserIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const fetchUserRoles = async (userId: string) => {
    try {
      console.log('Fetching user roles for user:', userId);
      
      const { data, error } = await supabase
        .from('user_roles' as any)
        .select('role')
        .eq('user_id', userId);

      if (error) {
        console.error('Error fetching user roles:', error);
        if (mountedRef.current) setUserRoles([]);
      } else {
        const roles = (data as any)?.map((r: any) => r.role) || [];
        console.log('User roles:', roles);
        if (mountedRef.current) setUserRoles(roles);
      }
    } catch (error) {
      console.error('Error fetching user roles:', error);
      if (mountedRef.current) setUserRoles([]);
    }
  };

  const checkInviteAccepted = async (personId: string, personName: string, personEmail: string) => {
    try {
      const { data: inviteLog } = await supabase
        .from('audit_logs')
        .select('actor_id, entidade_id')
        .eq('entidade', 'people')
        .eq('acao', 'ADMIN_SEND_INVITE')
        .eq('entidade_id', personId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!inviteLog?.actor_id) return;

      const { data: acceptedLog } = await supabase
        .from('audit_logs')
        .select('id')
        .eq('entidade', 'people')
        .eq('acao', 'INVITE_ACCEPTED')
        .eq('entidade_id', personId)
        .limit(1)
        .maybeSingle();

      if (acceptedLog) return;

      const { data: inviter } = await supabase
        .from('people')
        .select('nome, email')
        .eq('id', inviteLog.actor_id)
        .maybeSingle();

      if (!inviter?.email) return;

      await supabase
        .from('audit_logs')
        .insert({
          entidade: 'people',
          entidade_id: personId,
          acao: 'INVITE_ACCEPTED',
          actor_id: personId,
          payload: { inviter_id: inviteLog.actor_id } as any,
        });

      supabase.functions.invoke('send-notification-email', {
        body: {
          type: 'INVITE_ACCEPTED',
          to: inviter.email,
          requesterName: inviter.nome,
          collaboratorName: personName,
          collaboratorEmail: personEmail,
          targetPersonId: inviteLog.actor_id,
        },
      }).catch(err => console.warn('Failed to send invite accepted email:', err));

      supabase.functions.invoke('slack-notification', {
        body: {
          type: 'INVITE_ACCEPTED',
          personName: personName,
          personEmail: personEmail,
          targetPersonId: inviteLog.actor_id,
        },
      }).catch(err => console.warn('Failed to send invite accepted slack:', err));

      console.log('Invite accepted notifications sent for', personEmail);
    } catch (error) {
      console.warn('Error checking invite acceptance:', error);
    }
  };

  const fetchPersonData = useCallback(async (userId?: string) => {
    const userIdToUse = userId || user?.id;
    if (!userIdToUse) return;

    // Prevent duplicate concurrent fetches for the same user
    if (fetchingRef.current && loadedUserIdRef.current === userIdToUse) {
      console.log('fetchPersonData already in progress for:', userIdToUse);
      return;
    }

    fetchingRef.current = true;
    loadedUserIdRef.current = userIdToUse;
    
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

      if (!mountedRef.current) return;

      if (error) {
        console.error('Error fetching profile:', error);
        setPerson(null);
      } else if (profile?.people) {
        console.log('Profile found:', profile.people);
        const personData = profile.people as Person;
        setPerson(personData);
        
        await fetchUserRoles(userIdToUse);

        checkInviteAccepted(personData.id, personData.nome, personData.email);
      } else {
        console.log('No profile found for user');
        setPerson(null);
      }
    } catch (error) {
      console.error('Error fetching person data:', error);
      if (mountedRef.current) setPerson(null);
    } finally {
      fetchingRef.current = false;
      if (mountedRef.current) {
        setProfileChecked(true);
        setContractDateChecked(true);
        setLoading(false);
      }
    }
  }, [user?.id]);

  const hasRole = (role: string) => {
    return userRoles.includes(role);
  };

  useEffect(() => {
    mountedRef.current = true;
    let initialSessionHandled = false;
    
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mountedRef.current) return;
        
        console.log('Auth state change:', event);
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // If this is the INITIAL_SESSION event and initializeAuth already handled it, skip
          if (event === 'INITIAL_SESSION' && initialSessionHandled) {
            return;
          }
          // For sign in/token refresh, always fetch (but dedup protects us)
          fetchPersonData(session.user.id);
        } else {
          setPerson(null);
          setUserRoles([]);
          setProfileChecked(true);
          setContractDateChecked(true);
          setLoading(false);
        }
      }
    );

    // Get initial session
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (!mountedRef.current) return;
        
        if (error) {
          console.error('Auth initialization error:', error);
          setLoading(false);
          setProfileChecked(true);
          setContractDateChecked(true);
          return;
        }
        
        initialSessionHandled = true;
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
        if (mountedRef.current) {
          setLoading(false);
          setProfileChecked(true);
          setContractDateChecked(true);
        }
      }
    };

    // Timeout uses ref-based check to avoid stale closure
    const timeoutId = setTimeout(() => {
      if (mountedRef.current && !loadedUserIdRef.current) {
        console.warn('Auth initialization timeout - no profile loaded yet');
        setLoading(false);
        setProfileChecked(true);
        setContractDateChecked(true);
      }
    }, 10000);

    initializeAuth();

    return () => {
      mountedRef.current = false;
      clearTimeout(timeoutId);
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
    loadedUserIdRef.current = null;
    fetchingRef.current = false;
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

      loadedUserIdRef.current = null; // allow re-fetch
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
