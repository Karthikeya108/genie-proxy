import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  useListQueue,
  useGetQueueStats,
  useSimulateQueue,
  useClearQueue,
  useListGenieSpaces,
  type QueueItemOut,
} from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ListOrdered,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  AlertCircle,
  Trash2,
  Timer,
  Hourglass,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_sidebar/queue")({
  component: () => <QueuePage />,
});

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSec = (seconds % 60).toFixed(0);
  return `${minutes}m ${remainingSec}s`;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    {
      variant: "default" | "secondary" | "destructive" | "outline";
      icon: React.ReactNode;
    }
  > = {
    pending: { variant: "secondary", icon: <Clock className="h-3 w-3" /> },
    processing: {
      variant: "outline",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    completed: {
      variant: "default",
      icon: <CheckCircle className="h-3 w-3" />,
    },
    failed: { variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
    expired: {
      variant: "destructive",
      icon: <AlertCircle className="h-3 w-3" />,
    },
  };
  const c = config[status] || { variant: "secondary" as const, icon: null };
  return (
    <Badge variant={c.variant} className="flex items-center gap-1 text-xs">
      {c.icon}
      {status}
    </Badge>
  );
}

function QueueItemRow({ item }: { item: QueueItemOut }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <StatusBadge status={item.status} />
          {item.space_name && (
            <Badge variant="outline" className="text-xs shrink-0">
              <Sparkles className="h-3 w-3 mr-1" />
              {item.space_name}
            </Badge>
          )}
          <p className="text-sm font-medium truncate">{item.question}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 text-xs text-muted-foreground">
          {item.wait_time_ms != null && (
            <span className="flex items-center gap-1" title="Wait time">
              <Hourglass className="h-3 w-3" />
              {formatDuration(item.wait_time_ms)}
            </span>
          )}
          {item.run_time_ms != null && (
            <span className="flex items-center gap-1" title="Run time">
              <Timer className="h-3 w-3" />
              {formatDuration(item.run_time_ms)}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Hide" : "Details"}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="pt-2 space-y-2 text-sm">
          <Separator />
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">Request ID:</span>
              <code className="ml-1">
                {item.request_id.substring(0, 16)}...
              </code>
            </div>
            <div>
              <span className="text-muted-foreground">Space:</span>
              <span className="ml-1">
                {item.space_name || item.space_id.substring(0, 12) + "..."}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Space ID:</span>
              <code className="ml-1">{item.space_id.substring(0, 12)}...</code>
            </div>
            <div>
              <span className="text-muted-foreground">User:</span>
              <span className="ml-1">{item.user_email}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Created:</span>
              <span className="ml-1">
                {new Date(item.created_at).toLocaleString()}
              </span>
            </div>
            {item.started_at && (
              <div>
                <span className="text-muted-foreground">Started:</span>
                <span className="ml-1">
                  {new Date(item.started_at).toLocaleString()}
                </span>
              </div>
            )}
            {item.completed_at && (
              <div>
                <span className="text-muted-foreground">Completed:</span>
                <span className="ml-1">
                  {new Date(item.completed_at).toLocaleString()}
                </span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Attempts:</span>
              <span className="ml-1">
                {item.attempt_count}/{item.max_attempts}
              </span>
            </div>
            {item.wait_time_ms != null && (
              <div>
                <span className="text-muted-foreground">Wait Time:</span>
                <span className="ml-1">
                  {formatDuration(item.wait_time_ms)}
                </span>
              </div>
            )}
            {item.run_time_ms != null && (
              <div>
                <span className="text-muted-foreground">Run Time:</span>
                <span className="ml-1">
                  {formatDuration(item.run_time_ms)}
                </span>
              </div>
            )}
          </div>

          {item.error_message && (
            <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
              {item.error_message}
            </div>
          )}

          {item.response_data && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                Response Data
              </summary>
              <pre className="mt-1 p-2 bg-muted rounded overflow-x-auto">
                {JSON.stringify(item.response_data, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function SimulationPanel() {
  const { data: spacesResult } = useListGenieSpaces();
  const simulateMutation = useSimulateQueue();
  const queryClient = useQueryClient();
  const [selectedSpaces, setSelectedSpaces] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(true);
  const [numRequests, setNumRequests] = useState(10);

  const spaces = spacesResult?.data?.spaces ?? [];

  const toggleSpace = (spaceId: string) => {
    setSelectAll(false);
    setSelectedSpaces((prev) =>
      prev.includes(spaceId)
        ? prev.filter((s) => s !== spaceId)
        : [...prev, spaceId],
    );
  };

  const handleSelectAll = () => {
    setSelectAll(true);
    setSelectedSpaces([]);
  };

  const resolvedSpaceIds = selectAll
    ? spaces.map((s) => s.space_id)
    : selectedSpaces;

  const handleSimulate = async () => {
    if (resolvedSpaceIds.length === 0) {
      toast.error("Select at least one Genie Space");
      return;
    }

    try {
      const result = await simulateMutation.mutateAsync({
        data: {
          space_ids: resolvedSpaceIds,
          num_requests: numRequests,
        },
        params: {},
      });
      toast.success(`${result.data.length} requests queued across ${resolvedSpaceIds.length} space(s)`);
      queryClient.invalidateQueries({ queryKey: ["/api/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/queue/stats"] });
    } catch {
      toast.error("Simulation failed");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="h-5 w-5" />
          Queue Simulation
        </CardTitle>
        <CardDescription>
          Simulate queuing requests across Genie spaces
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Genie Spaces</label>
          <div className="space-y-1 max-h-40 overflow-y-auto border rounded-lg p-2">
            <label className="flex items-center gap-2 p-1 rounded hover:bg-muted cursor-pointer">
              <input
                type="checkbox"
                checked={selectAll}
                onChange={handleSelectAll}
                className="rounded"
              />
              <span className="text-sm font-medium">All Spaces ({spaces.length})</span>
            </label>
            <Separator className="my-1" />
            {spaces.map((space) => (
              <label
                key={space.space_id}
                className="flex items-center gap-2 p-1 rounded hover:bg-muted cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectAll || selectedSpaces.includes(space.space_id)}
                  onChange={() => toggleSpace(space.space_id)}
                  disabled={selectAll}
                  className="rounded"
                />
                <span className="text-sm truncate">{space.title}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Number of Requests (1-50)
          </label>
          <Input
            type="number"
            min={1}
            max={50}
            value={numRequests}
            onChange={(e) => setNumRequests(Number(e.target.value))}
          />
        </div>
        <Button
          onClick={handleSimulate}
          disabled={resolvedSpaceIds.length === 0 || simulateMutation.isPending}
          className="w-full"
        >
          {simulateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Simulate {numRequests} Requests
        </Button>
      </CardContent>
    </Card>
  );
}

type TabId = "current" | "history";

function QueuePage() {
  const [activeTab, setActiveTab] = useState<TabId>("current");
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  // Current tab: pending + processing
  const currentStatus =
    activeTab === "current"
      ? statusFilter || "pending"
      : statusFilter || undefined;
  // For current tab without explicit filter, fetch both pending and processing
  const { data: queueResult, isLoading } = useListQueue({
    params: {
      status:
        activeTab === "current" && !statusFilter ? null : currentStatus ?? null,
      limit: 100,
      offset: 0,
    },
    query: { refetchInterval: 3000 },
  });
  const { data: statsResult } = useGetQueueStats({
    query: { refetchInterval: 3000 },
  });
  const clearMutation = useClearQueue();
  const queryClient = useQueryClient();

  const queueData = queueResult?.data;
  const stats = statsResult?.data as Record<string, number> | null | undefined;

  // Filter items based on active tab
  const items = queueData?.items?.filter((item) => {
    if (activeTab === "current") {
      if (statusFilter) return item.status === statusFilter;
      return item.status === "pending" || item.status === "processing";
    } else {
      if (statusFilter) return item.status === statusFilter;
      return item.status === "completed" || item.status === "failed";
    }
  }) ?? [];

  const handleClear = async () => {
    try {
      const result = await clearMutation.mutateAsync();
      toast.success(`Cleared ${result.data.deleted_count} queue items`);
      queryClient.invalidateQueries({ queryKey: ["/api/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/queue/stats"] });
    } catch {
      toast.error("Failed to clear queue");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ListOrdered className="h-8 w-8" />
            Queue Monitor
          </h1>
          <p className="text-muted-foreground mt-1">
            View and manage queued Genie Space requests (5 QPM per workspace)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/queue"] });
              queryClient.invalidateQueries({ queryKey: ["/api/queue/stats"] });
            }}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={clearMutation.isPending}
          >
            {clearMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Trash2 className="h-4 w-4 mr-1" />
            )}
            Clear All
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card
          className={`cursor-pointer hover:border-primary/50 ${statusFilter === "pending" ? "border-primary" : ""}`}
          onClick={() =>
            setStatusFilter(statusFilter === "pending" ? undefined : "pending")
          }
        >
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold">{stats?.pending ?? 0}</p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer hover:border-primary/50 ${statusFilter === "processing" ? "border-primary" : ""}`}
          onClick={() =>
            setStatusFilter(
              statusFilter === "processing" ? undefined : "processing",
            )
          }
        >
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Processing</p>
                <p className="text-2xl font-bold">{stats?.processing ?? 0}</p>
              </div>
              <Loader2 className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer hover:border-primary/50 ${statusFilter === "completed" ? "border-primary" : ""}`}
          onClick={() =>
            setStatusFilter(
              statusFilter === "completed" ? undefined : "completed",
            )
          }
        >
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold">{stats?.completed ?? 0}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer hover:border-primary/50 ${statusFilter === "failed" ? "border-primary" : ""}`}
          onClick={() =>
            setStatusFilter(statusFilter === "failed" ? undefined : "failed")
          }
        >
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold">{stats?.failed ?? 0}</p>
              </div>
              <XCircle className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b">
        <button
          className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "current"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => {
            setActiveTab("current");
            setStatusFilter(undefined);
          }}
        >
          Current Run
          {(stats?.pending ?? 0) + (stats?.processing ?? 0) > 0 && (
            <Badge variant="secondary" className="ml-2 text-xs">
              {(stats?.pending ?? 0) + (stats?.processing ?? 0)}
            </Badge>
          )}
        </button>
        <button
          className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "history"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => {
            setActiveTab("history");
            setStatusFilter(undefined);
          }}
        >
          History
          {(stats?.completed ?? 0) + (stats?.failed ?? 0) > 0 && (
            <Badge variant="secondary" className="ml-2 text-xs">
              {(stats?.completed ?? 0) + (stats?.failed ?? 0)}
            </Badge>
          )}
        </button>
      </div>

      {/* Status Filter */}
      {statusFilter && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtering by:</span>
          <Badge variant="secondary">{statusFilter}</Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStatusFilter(undefined)}
          >
            Clear
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Queue Items */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-lg font-semibold">
            {activeTab === "current" ? "Active Requests" : "Completed Requests"}{" "}
            ({items.length})
          </h2>

          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="pt-4">
                    <div className="space-y-2">
                      <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
                      <div className="h-4 w-1/2 bg-muted animate-pulse rounded" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!isLoading && items.length === 0 && (
            <Card>
              <CardContent className="pt-6 text-center">
                <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  {activeTab === "current"
                    ? "No active requests. Use the simulation panel to queue some."
                    : "No completed requests yet."}
                </p>
                {activeTab === "current" && (
                  <Button variant="outline" className="mt-3" asChild>
                    <Link to="/spaces">Go to Genie Spaces</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {items.map((item) => (
            <QueueItemRow key={item.request_id} item={item} />
          ))}
        </div>

        {/* Simulation Panel */}
        <div>
          <SimulationPanel />
        </div>
      </div>
    </div>
  );
}
