"use client";

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CustomerAuthConfig = { url: string; key: string } | null;
type Auth = SupabaseClient["auth"];

export function useCustomerAuth(config: CustomerAuthConfig) {
  const [client, setClient] = useState<Auth | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(!!config);
  const url = config?.url;
  const key = config?.key;

  useEffect(() => {
    if (!url || !key) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    import("@supabase/supabase-js").then(({ createClient }) => {
      if (!active) return;
      const { auth } = createClient(url, key, { auth: { detectSessionInUrl: false } });
      setClient(auth);
      const { data } = auth.onAuthStateChange((_event, session) => {
        if (!active) return;
        setEmail(session?.user.email_confirmed_at ? session.user.email ?? "" : "");
        const fullName = session?.user.user_metadata?.full_name;
        setName(typeof fullName === "string" ? fullName : "");
        setLoading(false);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; unsubscribe?.(); };
  }, [url, key]);

  return useMemo(() => ({ client, email, name, loading }), [client, email, name, loading]);
}
