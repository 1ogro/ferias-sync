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
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, personId: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  createProfile: (personId: string) => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileChecked, setProfileChecked] = useState(false);

  const fetchPersonData = async (userId: string) => {
    try {
      console.log('Fetching person data for user:', userId);
      
      const { data: profile, error } = await supabase
        .from('profiles')
        .select(`
          person_id,
          people!inner(*)
        `)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        setPerson(null);
      } else if (profile?.people) {
        console.log('Profile found:', profile.people);
        setPerson(profile.people as Person);
      } else {
        console.log('No profile found for user');
        setPerson(null);
      }
    } catch (error) {
      console.error('Error fetching person data:', error);
      setPerson(null);
    } finally {
      setProfileChecked(true);
      setLoading(false);
    }
  };

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setTimeout(() => {
            fetchPersonData(session.user.id);
          }, 0);
        } else {
          setPerson(null);
          setProfileChecked(true);
          setLoading(false);
        }
      }
    );

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchPersonData(session.user.id);
      } else {
        setProfileChecked(true);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
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

  const signOut = async () => {
    await supabase.auth.signOut();
    setPerson(null);
    setProfileChecked(false);
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
    signIn,
    signUp,
    signOut,
    createProfile,
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