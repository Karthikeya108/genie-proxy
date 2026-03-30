import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useStartConversation,
  useSendMessage,
  type GenieMessageOut,
  type ApiError,
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Send,
  Sparkles,
  User,
  AlertCircle,
  Clock,
  Table,
  Code,
  ListOrdered,
} from "lucide-react";
import { toast } from "sonner";

interface ChatSearch {
  spaceId?: string;
  spaceName?: string;
}

export const Route = createFileRoute("/_sidebar/chat")({
  validateSearch: (search: Record<string, unknown>): ChatSearch => ({
    spaceId: search.spaceId as string | undefined,
    spaceName: search.spaceName as string | undefined,
  }),
  component: () => <ChatPage />,
});

interface Attachment {
  attachment_id?: string;
  id?: string;
  text?: string;
  query?: string;
  type?: string;
  query_result?: {
    columns?: { name: string; type: string }[];
    rows?: unknown[][];
    row_count?: number;
    truncated?: boolean;
  };
  [key: string]: unknown;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status?: string;
  attachments?: Attachment[];
  error?: Record<string, unknown> | null;
  queued?: boolean;
  queueRequestId?: string;
  timestamp: Date;
}

function DataTable({ attachment }: { attachment: Attachment }) {
  const qr = attachment.query_result;
  if (!qr?.columns || !qr?.rows) return null;

  return (
    <div className="mt-3 space-y-2">
      {attachment.query && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground flex items-center gap-1">
            <Code className="h-3 w-3" />
            Generated SQL
          </summary>
          <pre className="mt-1 p-2 rounded bg-muted text-xs overflow-x-auto">
            {attachment.query}
          </pre>
        </details>
      )}
      <div className="border rounded-lg overflow-auto max-h-80">
        <table className="w-full text-sm">
          <thead className="bg-muted sticky top-0">
            <tr>
              {qr.columns.map((col, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap"
                >
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {qr.rows.map((row, ri) => (
              <tr key={ri} className="border-t hover:bg-muted/50">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-2 whitespace-nowrap">
                    {String(cell ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Table className="h-3 w-3" />
        {qr.row_count} rows
        {qr.truncated && " (truncated)"}
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
      </div>
      <div className={`max-w-[80%] space-y-1 ${isUser ? "text-right" : ""}`}>
        <div
          className={`inline-block p-3 rounded-lg ${
            isUser ? "bg-primary text-primary-foreground" : "bg-muted"
          }`}
        >
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>

        {message.status && (
          <div className="flex items-center gap-1">
            <Badge
              variant={
                message.status === "COMPLETED"
                  ? "default"
                  : message.status === "FAILED"
                    ? "destructive"
                    : "secondary"
              }
              className="text-xs"
            >
              {message.status}
            </Badge>
          </div>
        )}

        {message.queued && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Queued due to QPM limit
            {message.queueRequestId && (
              <Link to="/queue" className="underline hover:text-foreground">
                View in queue
              </Link>
            )}
          </div>
        )}

        {message.attachments?.map((att, i) => (
          <div key={i}>
            {att.text && (
              <p className="text-sm text-muted-foreground mt-1">
                {typeof att.text === "string" ? att.text : JSON.stringify(att.text)}
              </p>
            )}
            {att.query_result && <DataTable attachment={att} />}
          </div>
        ))}

        {message.error && (
          <div className="flex items-center gap-1 text-xs text-destructive mt-1">
            <AlertCircle className="h-3 w-3" />
            {typeof message.error === "string" ? message.error : JSON.stringify(message.error)}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {message.timestamp.toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}

function ChatPage() {
  const { spaceId, spaceName } = Route.useSearch();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const startConversation = useStartConversation();
  const sendMessageMutation = useSendMessage();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !spaceId || isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      let result: GenieMessageOut;

      if (conversationId) {
        const resp = await sendMessageMutation.mutateAsync({
          params: { space_id: spaceId, conversation_id: conversationId },
          data: { question: userMessage.content },
        });
        result = resp.data;
      } else {
        const resp = await startConversation.mutateAsync({
          params: { space_id: spaceId },
          data: { question: userMessage.content },
        });
        setConversationId(resp.data.conversation_id);
        result = resp.data.message;
      }

      const attachments = (result.attachments ?? []) as Attachment[];
      const rawContent = attachments[0]?.text ?? result.content ?? "Response received.";
      const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
      const assistantMessage: ChatMessage = {
        id: result.message_id,
        role: "assistant",
        content,
        status: result.status,
        attachments,
        error: result.error,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      if (apiErr?.status === 202) {
        const detail = apiErr.body as {
          detail?: { request_id?: string; message?: string };
        };
        const queuedMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "system",
          content:
            detail?.detail?.message ||
            "Your request has been queued due to QPM rate limits. It will be processed shortly.",
          queued: true,
          queueRequestId: detail?.detail?.request_id,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, queuedMessage]);
        toast.info("Request queued", {
          description:
            "QPM limit reached. Your request will be processed from the queue.",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/queue"] });
        queryClient.invalidateQueries({ queryKey: ["/api/queue/stats"] });
      } else {
        const errorMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "system",
          content: `Error: ${apiErr?.message || "Failed to get response"}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        toast.error("Request failed");
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    input,
    spaceId,
    isLoading,
    conversationId,
    sendMessageMutation,
    startConversation,
    queryClient,
  ]);

  if (!spaceId) {
    return (
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            No Space Selected
          </CardTitle>
          <CardDescription>
            Select a Genie Space to start chatting.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/spaces">Browse Spaces</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">
            {spaceName || "Genie Chat"}
          </h1>
          <Badge variant="secondary" className="text-xs">
            {spaceId.substring(0, 8)}...
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setMessages([]);
              setConversationId(null);
            }}
          >
            New Chat
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/queue" className="flex items-center gap-1">
              <ListOrdered className="h-4 w-4" />
              Queue
            </Link>
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
            <Sparkles className="h-12 w-12 text-muted-foreground" />
            <h2 className="text-lg font-medium">Ask a question</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Ask questions about your data using natural language. If the rate
              limit is reached, your request will be automatically queued.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}

        {isLoading && (
          <div className="flex gap-3">
            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-muted flex items-center justify-center">
              <Sparkles className="h-4 w-4 animate-pulse" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t pt-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your data..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={!input.trim() || isLoading}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
