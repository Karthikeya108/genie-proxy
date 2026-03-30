import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense } from "react";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import { useListGenieSpacesSuspense } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, MessageSquare, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_sidebar/spaces")({
  component: () => <SpacesPage />,
});

function SpacesContent() {
  const { data: result } = useListGenieSpacesSuspense();
  const spaces = result.data.spaces;

  if (!spaces || spaces.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <Sparkles className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-2xl font-semibold">No Genie Spaces Found</h2>
        <p className="text-muted-foreground text-center max-w-md">
          No Genie Spaces are accessible with your current permissions. Contact
          your workspace administrator to get access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Genie Spaces</h1>
        <p className="text-muted-foreground mt-1">
          Select a Genie Space to start asking questions about your data.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {spaces.map((space) => (
          <Card
            key={space.space_id}
            className="hover:border-primary/50 transition-colors"
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                {space.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <code className="text-xs text-muted-foreground">
                  {space.space_id.substring(0, 12)}...
                </code>
                <Button size="sm" asChild>
                  <Link
                    to="/chat"
                    search={{ spaceId: space.space_id, spaceName: space.title }}
                    className="flex items-center gap-1"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Open Chat
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SpacesSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-96 mt-1" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-60" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-9 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function SpacesPage() {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          onReset={reset}
          fallbackRender={({ resetErrorBoundary }) => (
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-5 w-5" />
                  Failed to Load Genie Spaces
                </CardTitle>
                <CardDescription>
                  There was an error loading Genie Spaces. Make sure you are
                  authenticated and have the required permissions.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button variant="outline" onClick={resetErrorBoundary}>
                  Try Again
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/">Go Home</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        >
          <Suspense fallback={<SpacesSkeleton />}>
            <SpacesContent />
          </Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
