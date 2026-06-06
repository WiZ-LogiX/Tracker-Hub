import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { checkNeonConnection } from "@/lib/db-health.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/db-check")({ component: DbCheck });

function DbCheck() {
  const fn = useServerFn(checkNeonConnection);
  const q = useQuery({
    queryKey: ["neon-health"],
    queryFn: () => fn(),
    refetchOnWindowFocus: false,
  });

  return (
    <div className="p-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Neon connectivity check</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={() => q.refetch()} disabled={q.isFetching}>
            {q.isFetching ? "Checking…" : "Re-check"}
          </Button>
          <pre className="text-xs bg-muted p-3 rounded overflow-auto">
            {JSON.stringify(q.data ?? q.error, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
