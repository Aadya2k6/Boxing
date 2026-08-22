import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envFile = fs.readFileSync(".env", "utf8");
const urlMatch = envFile.match(/VITE_SUPABASE_URL=(.+)/);
const keyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY=(.+)/);

const url = urlMatch ? urlMatch[1].trim() : "";
const key = keyMatch ? keyMatch[1].trim() : "";

const supabase = createClient(url, key);

const testAccounts = [
  { email: "aadya@boxos.dev", pass: "aadya@boxos.dev" },
  { email: "superadmin@abc.in", pass: "12345678" },
  { email: "admin@abc.in", pass: "12345678" },
  { email: "coach@abc.in", pass: "12345678" },
  { email: "aa@boxos.dev", pass: "12345678" }
];

async function testAll() {
  for (const acc of testAccounts) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: acc.email,
      password: acc.pass,
    });
    if (error) {
      console.log(`[FAIL] ${acc.email}: ${error.message} (status: ${error.status})`);
    } else {
      console.log(`[SUCCESS] ${acc.email} logged in! User ID: ${data.user.id}`);
      // Fetch profile
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("role, full_name")
        .eq("id", data.user.id)
        .maybeSingle();
      console.log(`   Profile:`, profile, pErr ? `Error: ${pErr.message}` : "");
      await supabase.auth.signOut();
    }
  }
}

testAll();
