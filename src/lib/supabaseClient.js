import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Variáveis VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não encontradas. Configure o arquivo .env.local."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
