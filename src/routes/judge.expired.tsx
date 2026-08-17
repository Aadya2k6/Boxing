import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert, Mail } from "lucide-react";

export const Route = createFileRoute("/judge/expired")({ component: JudgeExpired });

function JudgeExpired() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-surface border border-destructive/20 rounded-2xl shadow-card overflow-hidden text-center animate-fade-up">
        <div className="bg-destructive/10 p-10 flex justify-center">
          <div className="size-20 rounded-full bg-destructive/20 flex items-center justify-center">
            <ShieldAlert className="size-10 text-destructive" strokeWidth={1.5} />
          </div>
        </div>
        <div className="p-8 space-y-4">
          <h1 className="font-display font-bold text-2xl text-foreground">Access Expired</h1>
          <p className="text-sm text-muted-foreground">
            Your access link is no longer valid. This usually means the tournament has concluded, or your invitation was revoked by the administration.
          </p>
          <div className="pt-4 flex flex-col gap-3">
            <a
              href="mailto:support@boxos.in"
              className="inline-flex items-center justify-center gap-2 w-full py-3 bg-elevated border border-border rounded-xl text-sm font-semibold hover:bg-subtle transition cursor-pointer"
            >
              <Mail className="size-4" /> Contact Administration
            </a>
            <Link
              to="/login"
              className="text-sm font-semibold text-muted-foreground hover:text-foreground transition underline underline-offset-4"
            >
              Return to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
