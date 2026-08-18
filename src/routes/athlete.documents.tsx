import { AccessGuard } from "@/components/dashboard/AccessGuard";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { Upload, FileText, Loader2, Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

type UploadedDocument = {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  source: "cloud" | "browser";
  uploadedAt: string;
};

export const Route = createFileRoute("/athlete/documents")({
  component: () => <Navigate to="/athlete" replace />,
});

function DocumentsPage() {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const storageKey = user ? `athlete-documents-${user.id}` : null;

  useEffect(() => {
    if (!storageKey) return;
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        setDocuments(JSON.parse(raw));
      } catch {
        setDocuments([]);
      }
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify(documents));
  }, [documents, storageKey]);

  async function readAsDataUrl(file: File) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  async function handleUpload(file: File) {
    if (!user) return;
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("Upload a file smaller than 10 MB.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      let url = "";
      let source: UploadedDocument["source"] = "browser";

      try {
        const path = `${user.id}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage
          .from("athlete-documents")
          .upload(path, file, { upsert: false });
        if (!error) {
          const { data } = supabase.storage.from("athlete-documents").getPublicUrl(path);
          url = data.publicUrl;
          source = "cloud";
        } else {
          throw error;
        }
      } catch {
        url = await readAsDataUrl(file);
      }

      const record: UploadedDocument = {
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        url,
        source,
        uploadedAt: new Date().toISOString(),
      };
      setDocuments((prev) => [record, ...prev]);
    } catch (err: any) {
      setUploadError(err.message ?? "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <AccessGuard>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUpload(file);
          e.currentTarget.value = "";
        }}
      />
      <PageHeader
        title="Documents"
        subtitle="Identity, certificates and receipts"
        actions={
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm hover:bg-primary-dark transition disabled:opacity-60"
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            {uploading ? "Uploading…" : "Upload"}
          </button>
        }
      />

      {uploadError && (
        <div className="mb-4 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {uploadError}
        </div>
      )}

      {documents.length === 0 ? (
        <div className="bg-surface border border-border border-dashed rounded-lg p-12 flex flex-col items-center justify-center text-center">
          <div className="size-12 rounded-full bg-subtle grid place-items-center text-muted-foreground mb-4">
            <FileText className="size-5" />
          </div>
          <div className="text-sm font-semibold mb-1">No documents uploaded</div>
          <div className="text-xs text-muted-foreground max-w-xs">
            Upload identity, medical or fee documents. They’ll be saved here for quick access.
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{doc.name}</div>
                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  <span>{(doc.size / 1024).toFixed(1)} KB</span>
                  <span>{doc.source === "cloud" ? "Supabase Storage" : "Browser stored"}</span>
                  <span>{new Date(doc.uploadedAt).toLocaleString("en-IN")}</span>
                </div>
              </div>
              <a
                href={doc.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-primary-dark hover:underline shrink-0"
              >
                <Link2 className="size-4" /> Open
              </a>
            </div>
          ))}
        </div>
      )}
    </AccessGuard>
  );
}
