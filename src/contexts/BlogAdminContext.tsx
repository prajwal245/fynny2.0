import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface BlogAdminContextType {
  isBlogAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const BlogAdminContext = createContext<BlogAdminContextType>({
  isBlogAdmin: false,
  loading: true,
  signOut: async () => {},
});

export function BlogAdminProvider({ children }: { children: React.ReactNode }) {
  const [isBlogAdmin, setIsBlogAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const check = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsBlogAdmin(false);
      setLoading(false);
      return;
    }
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const permitted = (roles ?? []).some((r: { role: string }) =>
      ["super_admin", "admin", "blog_admin"].includes(r.role),
    );
    setIsBlogAdmin(permitted);
    setLoading(false);
  };

  useEffect(() => {
    check();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => check());
    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setIsBlogAdmin(false);
  };

  return (
    <BlogAdminContext.Provider value={{ isBlogAdmin, loading, signOut }}>
      {children}
    </BlogAdminContext.Provider>
  );
}

export const useBlogAdmin = () => useContext(BlogAdminContext);
