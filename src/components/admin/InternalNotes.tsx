import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from "@/lib/useAuth";

export function InternalNotes({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<any[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (entityId) load(); }, [entityType, entityId]);

  async function load() {
    const { data } = await supabase
      .from("internal_notes")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });
    const list = data ?? [];
    // We resolve display names from the auth session user object first;
    // any name we can't show falls back to "—". A profiles table isn't part
    // of the Phase 1 schema (notes carry author_id; rendering a human label
    // requires a server-side lookup we don't have here yet).
    const sessionUserId = (await supabase.auth.getUser()).data.user?.id;
    const nameMap: Record<string, string> = sessionUserId
      ? { [sessionUserId]: (await supabase.auth.getUser()).data.user?.email ?? "—" }
      : {};
    setNotes(list.map((n: any) => ({ ...n, author_name: nameMap[n.author_id] ?? "—" })));
  }

  async function submit() {
    if (!body.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("internal_notes").insert({
      entity_type: entityType, entity_id: entityId, body: body.trim(), author_id: user?.id,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setBody(""); load();
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">ملاحظات داخلية ({notes.length})</div>
      <div className="space-y-2 max-h-48 overflow-auto">
        {notes.length === 0 && <div className="text-xs text-muted-foreground">لا ملاحظات بعد.</div>}
        {notes.map(n => (
          <div key={n.id} className="text-xs border rounded-md p-2 bg-muted/30">
            <div className="whitespace-pre-wrap">{n.body}</div>
            <div className="mt-1 text-[10px] text-muted-foreground">{n.author_name} • {new Date(n.created_at).toLocaleString("ar-EG")}</div>
          </div>
        ))}
      </div>
      <Textarea rows={2} placeholder="اكتب ملاحظة..." value={body} onChange={e => setBody(e.target.value)} />
      <Button size="sm" disabled={!body.trim() || busy} onClick={submit}>إضافة ملاحظة</Button>
    </div>
  );
}
