import { createClient } from "@supabase/supabase-js";

// We need the anon key and url from .env
const url = process.env.VITE_SUPABASE_URL || "YOUR_URL";
const key = process.env.VITE_SUPABASE_ANON_KEY || "YOUR_KEY";

const supabase = createClient(url, key);

async function check() {
  const { data, error } = await supabase.from('user_profiles').select('*').limit(5);
  console.log("Profiles:");
  console.dir(data, { depth: null });
}

check();
