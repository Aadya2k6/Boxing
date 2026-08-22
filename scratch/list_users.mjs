import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envFile = fs.readFileSync(".env", "utf8");
const urlMatch = envFile.match(/VITE_SUPABASE_URL=(.+)/);
const keyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY=(.+)/);

const url = urlMatch ? urlMatch[1].trim() : "";
const key = keyMatch ? keyMatch[1].trim() : "";

const supabase = createClient(url, key);

async function listAllProfiles() {
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: "superadmin@abc.in",
    password: "12345678",
  });
  if (authErr) {
    console.log("Superadmin login failed:", authErr);
    return;
  }

  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, email, role, full_name, created_at");

  console.log("All User Profiles in Database:", profiles);
}

listAllProfiles();
