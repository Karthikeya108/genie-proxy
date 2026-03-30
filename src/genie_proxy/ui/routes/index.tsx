import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/apx/navbar";
import { Sparkles, ListOrdered, MessageSquare } from "lucide-react";
import { BubbleBackground } from "@/components/backgrounds/bubble";

export const Route = createFileRoute("/")({
  component: () => <Index />,
});

function Index() {
  return (
    <div className="relative h-screen w-screen overflow-hidden flex flex-col">
      <Navbar />

      <main className="flex-1 grid md:grid-cols-2">
        <BubbleBackground interactive />

        <div className="relative flex flex-col items-center justify-center p-8 md:p-12 border-l">
          <div className="max-w-lg space-y-8 text-center">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold">
              Genie Proxy
            </h1>
            <p className="text-lg text-muted-foreground">
              Access Databricks Genie Spaces across workspaces with intelligent
              request queuing for QPM rate limits.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild>
                <Link to="/spaces" className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  Browse Spaces
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/queue" className="flex items-center gap-2">
                  <ListOrdered className="h-5 w-5" />
                  Queue Monitor
                </Link>
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-4">
              <div className="text-center">
                <Sparkles className="h-8 w-8 mx-auto mb-2 text-primary" />
                <p className="text-sm font-medium">Multi-Space</p>
                <p className="text-xs text-muted-foreground">
                  Access multiple Genie Spaces
                </p>
              </div>
              <div className="text-center">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 text-primary" />
                <p className="text-sm font-medium">User Identity</p>
                <p className="text-xs text-muted-foreground">
                  Uses your permissions
                </p>
              </div>
              <div className="text-center">
                <ListOrdered className="h-8 w-8 mx-auto mb-2 text-primary" />
                <p className="text-sm font-medium">Smart Queue</p>
                <p className="text-xs text-muted-foreground">
                  Lakebase-backed queuing
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <div className="absolute inset-0 -z-10 h-full w-full bg-background" />
    </div>
  );
}
