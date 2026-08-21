import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { PageHeader } from "@/components/dashboard/DashboardLayout";
import { Plus, Trash2, Megaphone, Image as ImageIcon, UploadCloud, X, Edit3, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/superadmin/announcements")({
  component: AnnouncementsPage,
});

type TargetRole = "admin" | "coach" | "athlete";

const ROLES: { id: TargetRole; label: string }[] = [
  { id: "admin", label: "Admin" },
  { id: "coach", label: "Coach" },
  { id: "athlete", label: "Boxer" },
];

interface Notice {
  id: string;
  text: string;
  targets: TargetRole[];
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  active: boolean;
}

interface Ad {
  id: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  targets: TargetRole[];
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  active: boolean;
}

const TARGET_PORTALS = [
  { id: "admin", label: "Admin" },
  { id: "coach", label: "Coach" },
  { id: "athlete", label: "Athlete" },
];

function AnnouncementsPage() {
  const [activeTab, setActiveTab] = useState<"notices" | "ads">("notices");
  const [isCreating, setIsCreating] = useState(false);

  // Initialize from localStorage immediately so data is never lost on refresh
  const [notices, setNotices] = useState<Notice[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("boxos_notices");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [ads, setAds] = useState<Ad[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("boxos_ads");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      // 1. Ensure local data is fresh
      try {
        const savedNotices = localStorage.getItem("boxos_notices");
        if (savedNotices && isMounted) {
          const parsed = JSON.parse(savedNotices);
          if (Array.isArray(parsed) && parsed.length > 0) setNotices(parsed);
        }
      } catch (e) {}

      try {
        const savedAds = localStorage.getItem("boxos_ads");
        if (savedAds && isMounted) {
          const parsed = JSON.parse(savedAds);
          if (Array.isArray(parsed) && parsed.length > 0) setAds(parsed);
        }
      } catch (e) {}

      // 2. Try remote storage sync
      try {
        const { data: nData, error: nErr } = await supabase.storage.from('marketing').download('config/notices.json');
        if (!nErr && nData && isMounted) {
          const parsed = JSON.parse(await nData.text());
          if (Array.isArray(parsed) && parsed.length > 0) {
            setNotices(parsed);
            localStorage.setItem("boxos_notices", JSON.stringify(parsed));
          }
        }
      } catch (e) {}

      try {
        const { data: aData, error: aErr } = await supabase.storage.from('marketing').download('config/ads.json');
        if (!aErr && aData && isMounted) {
          const parsed = JSON.parse(await aData.text());
          if (Array.isArray(parsed) && parsed.length > 0) {
            setAds(parsed);
            localStorage.setItem("boxos_ads", JSON.stringify(parsed));
          }
        }
      } catch (e) {}
    }

    loadData();
    return () => { isMounted = false; };
  }, []);

  const saveNotices = (newNotices: Notice[]) => {
    setNotices(newNotices);
    try {
      localStorage.setItem("boxos_notices", JSON.stringify(newNotices));
      window.dispatchEvent(new Event("boxos_marketing_update"));
    } catch (e) {}

    (async () => {
      try {
        const file = new Blob([JSON.stringify(newNotices)], { type: 'application/json' });
        await supabase.storage.from('marketing').upload('config/notices.json', file, {
          contentType: 'application/json',
          upsert: true
        });
      } catch (e) {}
    })();
  };

  const saveAds = (newAds: Ad[]) => {
    setAds(newAds);
    try {
      localStorage.setItem("boxos_ads", JSON.stringify(newAds));
      window.dispatchEvent(new Event("boxos_marketing_update"));
    } catch (e) {}

    (async () => {
      try {
        const file = new Blob([JSON.stringify(newAds)], { type: 'application/json' });
        await supabase.storage.from('marketing').upload('config/ads.json', file, {
          contentType: 'application/json',
          upsert: true
        });
      } catch (e) {}
    })();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ads & Notices"
        subtitle="Manage global notices and advertisement campaigns across all portals"
        actions={
          <button
            onClick={() => setIsCreating(true)}
            className="bg-[#ef4444] hover:bg-[#ef4444]/90 text-white px-5 py-2.5 rounded-full font-bold tracking-wide transition-colors flex items-center gap-2 shadow-sm text-sm"
          >
            <Plus className="size-4 stroke-[3]" />
            {activeTab === "notices" ? "New Notice" : "New Ad"}
          </button>
        }
      />

      <div className="flex gap-4 border-b border-border mb-6">
        <button
          onClick={() => setActiveTab("notices")}
            className={`px-4 py-3 font-semibold text-sm transition border-b-2 ${
              activeTab === "notices"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
        >
          <div className="flex items-center gap-2">
            <Megaphone className="size-4" />
            Global Notices
          </div>
        </button>
        <button
          onClick={() => setActiveTab("ads")}
            className={`px-4 py-3 font-semibold text-sm transition border-b-2 ${
              activeTab === "ads"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
        >
          <div className="flex items-center gap-2">
            <ImageIcon className="size-4" />
            Popup Ads
          </div>
        </button>
      </div>

      {activeTab === "notices" ? (
        <NoticesList notices={notices} onChange={saveNotices} />
      ) : (
        <AdsList ads={ads} onChange={saveAds} />
      )}

      {/* Shared Create Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold">{activeTab === "notices" ? "Create New Notice" : "Create New Ad Campaign"}</h3>
              <button
                onClick={() => setIsCreating(false)}
                className="p-2 -mr-2 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
            
            <div className="p-5 max-h-[80vh] overflow-y-auto">
              {activeTab === "notices" ? (
                <NoticeForm 
                  onSubmit={(n) => { saveNotices([n, ...notices]); setIsCreating(false); }} 
                  onCancel={() => setIsCreating(false)} 
                />
              ) : (
                <AdForm 
                  onSubmit={(a) => { saveAds([a, ...ads]); setIsCreating(false); }} 
                  onCancel={() => setIsCreating(false)} 
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NoticesList({ notices, onChange }: { notices: Notice[]; onChange: (n: Notice[]) => void }) {
  const toggleActive = (id: string) => {
    onChange(notices.map((n) => n.id === id ? { ...n, active: !n.active } : n));
  };
  const deleteNotice = (id: string) => {
    onChange(notices.filter((n) => n.id !== id));
  };

  return (
    <div>
      <div className="bg-[#121629] text-[10px] uppercase tracking-widest font-semibold text-muted-foreground px-4 py-2.5 flex items-center rounded-t-xl border border-border">
        <div className="flex-1">Notice Text</div>
        <div className="w-48">Valid Targets</div>
        <div className="w-48">Duration</div>
        <div className="w-24 text-center">Status</div>
        <div className="w-20 text-right">Actions</div>
      </div>
      
      {notices.length === 0 ? (
        <div className="px-4 py-12 bg-surface border border-t-0 border-border rounded-b-xl text-center text-muted-foreground text-sm">
          No notices configured yet.
        </div>
      ) : (
        notices.map((n) => (
          <div key={n.id} className="px-4 py-3.5 bg-surface border border-t-0 border-border last:rounded-b-xl flex items-center transition-colors hover:bg-subtle/30">
            <div className="flex-1 min-w-0 pr-4">
              <div className="flex items-center gap-2">
                <Megaphone className="size-3.5 text-primary shrink-0" />
                <span className="font-semibold text-sm truncate">{n.text}</span>
              </div>
            </div>
            <div className="w-48 text-xs text-muted-foreground flex gap-1 flex-wrap pr-4">
              {n.targets.map(t => <span key={t} className="bg-subtle/50 border border-border px-1.5 py-0.5 rounded capitalize">{t}</span>)}
            </div>
            <div className="w-48 text-xs text-muted-foreground pr-4 flex flex-col justify-center">
              <span>{n.startDate} to {n.endDate}</span>
              <span className="opacity-75">Daily: {n.startTime} - {n.endTime}</span>
            </div>
            <div className="w-24 flex justify-center">
              <button 
                onClick={() => toggleActive(n.id)}
                className={`w-9 h-5 rounded-full relative transition-colors ${n.active ? "bg-primary" : "bg-muted"}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${n.active ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </div>
            <div className="w-20 flex justify-end gap-1">
              <button className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-subtle">
                <Edit3 className="size-4" />
              </button>
              <button onClick={() => deleteNotice(n.id)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-destructive/10">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function AdsList({ ads, onChange }: { ads: Ad[]; onChange: (a: Ad[]) => void }) {
  const toggleActive = (id: string) => {
    onChange(ads.map((a) => a.id === id ? { ...a, active: !a.active } : a));
  };
  const deleteAd = (id: string) => {
    onChange(ads.filter((a) => a.id !== id));
  };

  return (
    <div>
      <div className="bg-[#121629] text-[10px] uppercase tracking-widest font-semibold text-muted-foreground px-4 py-2.5 flex items-center rounded-t-xl border border-border">
        <div className="flex-1">Media</div>
        <div className="w-48">Valid Targets</div>
        <div className="w-48">Duration</div>
        <div className="w-24 text-center">Status</div>
        <div className="w-20 text-right">Actions</div>
      </div>
      
      {ads.length === 0 ? (
        <div className="px-4 py-12 bg-surface border border-t-0 border-border rounded-b-xl text-center text-muted-foreground text-sm">
          No ads configured yet.
        </div>
      ) : (
        ads.map((a) => (
          <div key={a.id} className="px-4 py-3 bg-surface border border-t-0 border-border last:rounded-b-xl flex items-center transition-colors hover:bg-subtle/30">
            <div className="flex-1 min-w-0 pr-4 flex items-center gap-3">
              <div className="w-16 h-10 rounded bg-subtle border border-border overflow-hidden relative shrink-0">
                {a.mediaType === 'video' ? (
                  <video src={a.mediaUrl} className="w-full h-full object-cover" muted />
                ) : (
                  <img src={a.mediaUrl} alt="Ad" className="w-full h-full object-cover" />
                )}
              </div>
              <div>
                <span className="font-semibold text-sm block">Popup Campaign</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest">{a.mediaType}</span>
              </div>
            </div>
            <div className="w-48 text-xs text-muted-foreground flex gap-1 flex-wrap pr-4">
              {a.targets.map(t => <span key={t} className="bg-subtle/50 border border-border px-1.5 py-0.5 rounded capitalize">{t}</span>)}
            </div>
            <div className="w-48 text-xs text-muted-foreground pr-4 flex flex-col justify-center">
              <span>{a.startDate} to {a.endDate}</span>
              <span className="opacity-75">Daily: {a.startTime} - {a.endTime}</span>
            </div>
            <div className="w-24 flex justify-center">
              <button 
                onClick={() => toggleActive(a.id)}
                className={`w-9 h-5 rounded-full relative transition-colors ${a.active ? "bg-primary" : "bg-muted"}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${a.active ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </div>
            <div className="w-20 flex justify-end gap-1">
              <button className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-subtle">
                <Edit3 className="size-4" />
              </button>
              <button onClick={() => deleteAd(a.id)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-destructive/10">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────
// Forms
// ────────────────────────────────────────────────────────

function NoticeForm({ onSubmit, onCancel }: { onSubmit: (n: Notice) => void; onCancel: () => void }) {
  const todayStr = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const futureStr = () => {
    const d = new Date(Date.now() + 365 * 86400000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const [text, setText] = useState("");
  const [targets, setTargets] = useState<TargetRole[]>(["admin"]);
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(futureStr());
  const [startTime, setStartTime] = useState("00:00");
  const [endTime, setEndTime] = useState("23:59");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      id: Math.random().toString(36).substring(2, 9),
      text, targets, startDate, endDate, startTime, endTime, active: true
    });
  };

  const toggleTarget = (r: TargetRole) => {
    setTargets((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notice Text (Marquee)</label>
        <input
          type="text"
          required
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="input-field w-full"
          placeholder="e.g., Important: The gym will be closed tomorrow for maintenance."
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Target Portals</label>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => toggleTarget(r.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                targets.includes(r.id)
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-surface border-border text-muted-foreground hover:bg-subtle"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Start Date</label>
          <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-field w-full" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">End Date</label>
          <input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input-field w-full" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Daily Start Time</label>
          <input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input-field w-full" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Daily End Time</label>
          <input type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} className="input-field w-full" />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-border">
        <button type="button" onClick={onCancel} className="px-5 py-2.5 font-semibold text-muted-foreground hover:text-foreground transition-colors rounded-full text-sm">Cancel</button>
        <button type="submit" disabled={!text || targets.length===0 || !startDate || !endDate} className="bg-[#ef4444] hover:bg-[#ef4444]/90 text-white px-5 py-2.5 rounded-full font-bold tracking-wide transition-colors disabled:opacity-50 text-sm shadow-sm cursor-pointer">Publish Notice</button>
      </div>
    </form>
  );
}

function AdForm({ onSubmit, onCancel }: { onSubmit: (a: Ad) => void; onCancel: () => void }) {
  const todayStr = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const futureStr = () => {
    const d = new Date(Date.now() + 365 * 86400000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [targets, setTargets] = useState<TargetRole[]>(["admin"]);
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(futureStr());
  const [startTime, setStartTime] = useState("00:00");
  const [endTime, setEndTime] = useState("23:59");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setErrorMsg("");

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 9)}_${Date.now()}.${fileExt}`;
      const filePath = `ads/${fileName}`;

      const { error } = await supabase.storage.from('marketing').upload(filePath, file);
      if (error) throw new Error(`Failed to upload: ${error.message}. Ensure 'marketing' bucket exists and is public.`);

      const { data: publicUrlData } = supabase.storage.from('marketing').getPublicUrl(filePath);
      const mediaType = file.type.startsWith('video/') ? 'video' : 'image';

      onSubmit({
        id: Math.random().toString(36).substring(2, 9),
        mediaUrl: publicUrlData.publicUrl,
        mediaType, targets, startDate, endDate, startTime, endTime, active: true
      });
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setUploading(false);
    }
  };

  const toggleTarget = (r: TargetRole) => {
    setTargets((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errorMsg && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg flex items-start gap-2">
          <X className="size-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Upload Media (Image or Video)</label>
        <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:bg-subtle/50 transition-colors">
          <input 
            type="file" 
            accept="image/*,video/*"
            onChange={(e) => e.target.files && setFile(e.target.files[0])}
            className="hidden" 
            id="ad-upload" 
          />
          <label htmlFor="ad-upload" className="cursor-pointer flex flex-col items-center gap-2">
            <UploadCloud className="size-6 text-muted-foreground" />
            <span className="text-sm font-medium">{file ? file.name : "Click to select a file"}</span>
            <span className="text-xs text-muted-foreground">Supported: JPG, PNG, GIF, MP4 (Max 10MB)</span>
          </label>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Target Portals</label>
        <div className="flex flex-wrap gap-2">
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => toggleTarget(r.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                targets.includes(r.id)
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-surface border-border text-muted-foreground hover:bg-subtle"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Start Date</label>
          <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-field w-full" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">End Date</label>
          <input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input-field w-full" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Daily Start Time</label>
          <input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input-field w-full" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Daily End Time</label>
          <input type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} className="input-field w-full" />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-border">
        <button type="button" onClick={onCancel} className="px-5 py-2.5 font-semibold text-muted-foreground hover:text-foreground transition-colors rounded-full text-sm" disabled={uploading}>Cancel</button>
        <button type="submit" disabled={uploading || !file || targets.length===0 || !startDate || !endDate} className="bg-[#ef4444] hover:bg-[#ef4444]/90 text-white px-5 py-2.5 rounded-full font-bold tracking-wide transition-colors disabled:opacity-50 text-sm shadow-sm">
          {uploading ? "Uploading..." : "Publish Ad"}
        </button>
      </div>
    </form>
  );
}
