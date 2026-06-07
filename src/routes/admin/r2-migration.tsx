// R2 Migration Admin Page
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { migratePhotosToR2, getMigrationStatus } from "@/lib/r2-migration.functions";

export const Route = createFileRoute("/admin/r2-migration")({
  component: R2MigrationPage,
});

function R2MigrationPage() {
  const [status, setStatus] = useState<{
    supabaseStorage: number;
    r2: number;
    other: number;
    total: number;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [dryRun, setDryRun] = useState(true);
  const [offset, setOffset] = useState(0);

  const getStatus = useServerFn(getMigrationStatus);
  const migrate = useServerFn(migratePhotosToR2);

  const loadStatus = async () => {
    const s = await getStatus({});
    setStatus(s);
  };

  const runMigration = async () => {
    setRunning(true);
    setLogs([]);
    setProgress(0);
    let currentOffset = 0;
    let hasMore = true;

    while (hasMore && running) {
      const result = await migrate({ data: { batchSize: 20, offset: currentOffset, dryRun } });
      
      // Handle the case where no more photos to migrate
      if ('message' in result) {
        setLogs(prev => [...prev, result.message]);
        hasMore = false;
        break;
      }
      
      setLogs(prev => [...prev, `Batch ${currentOffset / 20 + 1}: migrated ${result.migrated}, failed ${result.failed}, skipped ${result.skipped}`]);
      if (result.errors.length) {
        result.errors.forEach(e => setLogs(prev => [...prev, `  Error: ${e}`]));
      }
      currentOffset = result.nextOffset ?? currentOffset + 20;
      hasMore = result.hasMore ?? false;
      setProgress(prev => prev + 10);
      if (hasMore) {
        await new Promise(r => setTimeout(r, 500)); // small delay between batches
      }
    }

    setRunning(false);
    await loadStatus();
    toast.success(dryRun ? "Dry run complete" : "Migration complete");
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-serif text-3xl font-bold">R2 Migration Tool</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Migrate production photos from Supabase Storage to Cloudflare R2
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Migration Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status && (
            <div className="grid grid-cols-4 gap-4 text-center">
              <div className="p-4 border rounded-lg">
                <div className="text-2xl font-bold text-destructive">{status.supabaseStorage}</div>
                <div className="text-xs text-muted-foreground">Supabase Storage</div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-2xl font-bold text-green-600">{status.r2}</div>
                <div className="text-xs text-muted-foreground">R2</div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{status.other}</div>
                <div className="text-xs text-muted-foreground">Other/Unknown</div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-2xl font-bold">{status.total}</div>
                <div className="text-xs text-muted-foreground">Total Photos</div>
              </div>
            </div>
          )}
          <Button onClick={loadStatus} variant="outline" size="sm">
            Refresh Status
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Run Migration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={e => setDryRun(e.target.checked)}
                className="rounded border-input"
              />
              <span className="text-sm">Dry run (don't actually migrate)</span>
            </label>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={runMigration}
              disabled={running || status?.supabaseStorage === 0}
              className="flex-1"
            >
              {running ? "Running..." : dryRun ? "Start Dry Run" : "Start Migration"}
            </Button>
            <Button
              onClick={() => { setRunning(false); }}
              disabled={!running}
              variant="destructive"
              size="sm"
            >
              Stop
            </Button>
          </div>

          {running && (
            <div className="space-y-2">
              <Progress value={Math.min(progress, 100)} className="h-2" />
              <p className="text-xs text-muted-foreground">Processing batches...</p>
            </div>
          )}

          <div className="max-h-64 overflow-auto border rounded p-2 bg-muted/30 font-mono text-xs">
            {logs.map((log, i) => (
              <div key={i} className="text-left">{log}</div>
            ))}
            {logs.length === 0 && <div className="text-muted-foreground">No logs yet</div>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}