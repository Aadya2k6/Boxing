import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envFile = fs.readFileSync(".env", "utf8");
const urlMatch = envFile.match(/VITE_SUPABASE_URL=(.+)/);
const keyMatch = envFile.match(/VITE_SUPABASE_ANON_KEY=(.+)/);

const url = urlMatch ? urlMatch[1].trim() : "";
const key = keyMatch ? keyMatch[1].trim() : "";

const supabase = createClient(url, key);

const passwordsToTest = [
  "12345678",
  "123456789",
  "judge@abc.in",
  "123456",
  "1234567",
  "1234567890",
  "password123",
  "abc123456"
];

async function checkJudge() {
  for (const pass of passwordsToTest) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: "judge@abc.in", password: pass });
    if (!error && data.user) {
      console.log(`✅ MATCH FOUND! Email: judge@abc.in | Password: ${pass}`);
      return;
    }
  }
  console.log("No match found for judge@abc.in");
}

checkJudge();
