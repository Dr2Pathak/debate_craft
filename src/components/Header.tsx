import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface HeaderProps {
  showAuth?: boolean;
}

export const Header = ({ showAuth = true }: HeaderProps) => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <header className="absolute top-0 left-0 right-0 z-50 pt-6 pb-6">
      <div className="max-w-7xl mx-auto flex justify-end px-6">
        {showAuth && (
          <div className="flex gap-3">
            {user ? (
              <>
                <span className="text-white/80 flex items-center px-3">{user.email}</span>
                <Button
                  onClick={handleSignOut}
                  variant="outline"
                  className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                >
                  Sign Out
                </Button>
              </>
            ) : (
              <Button
                onClick={() => navigate("/auth")}
                className="bg-secondary text-secondary-foreground hover:bg-secondary/90 font-semibold"
              >
                Sign In
              </Button>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
