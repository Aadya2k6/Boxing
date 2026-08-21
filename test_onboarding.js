import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Extract supabase url and key from .env
const envPath = path.join(process.cwd(), ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
let supabaseUrl = "";
let supabaseKey = "";
for (const line of envContent.split("\n")) {
  if (line.startsWith("VITE_SUPABASE_URL=")) supabaseUrl = line.split("=")[1].trim();
  if (line.startsWith("VITE_SUPABASE_ANON_KEY=")) supabaseKey = line.split("=")[1].trim();
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const email = `test_${Date.now()}@example.com`;
  const password = "Password123!";

  console.log("Signing up...");
  const { data: authData, error: authErr } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: "Test Athlete" } }
  });

  if (authErr) {
    console.error("SignUp error:", authErr);
    return;
  }

  const currentUserId = authData.user?.id;
  console.log("Current user ID:", currentUserId);

  // Let's check if profiles exists
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", currentUserId)
    .maybeSingle();
  console.log("Profile after signup:", profile, profErr);

  // Attempt boxer_profiles insert
  console.log("Inserting boxer_profiles...");
  const { data: bp, error: bpErr } = await supabase
    .from("boxer_profiles")
    .insert({
      user_id: currentUserId,
      academy_id: "00000000-0000-0000-0000-000000000000", // Will probably fail academy FK first, but let's see
      full_name: "Test Athlete",
      date_of_birth: "2000-01-01",
      gender: "Male",
      medical_fitness_declared: true,
      onboarding_complete: true,
      record_wins: 0,
      record_losses: 0,
      record_draws: 0,
      record_kos: 0
    })
    .select("id")
    .maybeSingle();

  console.log("Boxer profiles insert result:", bp, bpErr);
}

test();
