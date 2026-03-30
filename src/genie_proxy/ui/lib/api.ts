import { useQuery, useSuspenseQuery, useMutation } from "@tanstack/react-query";
import type { UseQueryOptions, UseSuspenseQueryOptions, UseMutationOptions } from "@tanstack/react-query";
export class ApiError extends Error {
    status: number;
    statusText: string;
    body: unknown;
    constructor(status: number, statusText: string, body: unknown){
        super(`HTTP ${status}: ${statusText}`);
        this.name = "ApiError";
        this.status = status;
        this.statusText = statusText;
        this.body = body;
    }
}
export interface ClearQueueOut {
    deleted_count: number;
}
export interface GenieConversationOut {
    conversation_id: string;
    message: GenieMessageOut;
    space_id: string;
    title?: string | null;
}
export interface GenieMessageOut {
    attachments?: Record<string, unknown>[] | null;
    content: string;
    conversation_id: string;
    created_at?: number | null;
    error?: Record<string, unknown> | null;
    message_id: string;
    space_id: string;
    status: string;
}
export interface GenieQueryResultOut {
    columns?: Record<string, unknown>[] | null;
    row_count?: number | null;
    rows?: unknown[][] | null;
    truncated?: boolean;
}
export interface GenieSpaceInfo {
    description?: string | null;
    space_id: string;
    title: string;
}
export interface GenieSpaceListOut {
    spaces: GenieSpaceInfo[];
}
export interface HTTPValidationError {
    detail?: ValidationError[];
}
export interface QueueItemOut {
    attempt_count: number;
    completed_at?: string | null;
    created_at: string;
    error_message?: string | null;
    max_attempts: number;
    question: string;
    request_id: string;
    response_data?: Record<string, unknown> | null;
    run_time_ms?: number | null;
    space_id: string;
    space_name?: string | null;
    started_at?: string | null;
    status: string;
    updated_at: string;
    user_email: string;
    wait_time_ms?: number | null;
}
export interface QueueListOut {
    completed_count: number;
    failed_count: number;
    items: QueueItemOut[];
    pending_count: number;
    processing_count: number;
    total: number;
}
export interface QueuedResponseOut {
    message: string;
    position?: number | null;
    request_id: string;
    status: string;
}
export interface SendMessageRequest {
    question: string;
}
export interface SimulateQueueRequest {
    num_requests?: number;
    questions?: string[] | null;
    space_id?: string | null;
    space_ids?: string[] | null;
}
export interface StartConversationRequest {
    question: string;
}
export interface ValidationError {
    ctx?: Record<string, unknown>;
    input?: unknown;
    loc: (string | number)[];
    msg: string;
    type: string;
}
export interface VersionOut {
    version: string;
}
export interface CurrentUserParams {
    "X-Forwarded-Host"?: string | null;
    "X-Forwarded-Preferred-Username"?: string | null;
    "X-Forwarded-User"?: string | null;
    "X-Forwarded-Email"?: string | null;
    "X-Request-Id"?: string | null;
    "X-Forwarded-Access-Token"?: string | null;
}
export const currentUser = async (params?: CurrentUserParams, options?: RequestInit): Promise<{
    data: unknown;
}> =>{
    const res = await fetch("/api/current-user", {
        ...options,
        method: "GET",
        headers: {
            ...(params?.["X-Forwarded-Host"] != null && {
                "X-Forwarded-Host": params["X-Forwarded-Host"]
            }),
            ...(params?.["X-Forwarded-Preferred-Username"] != null && {
                "X-Forwarded-Preferred-Username": params["X-Forwarded-Preferred-Username"]
            }),
            ...(params?.["X-Forwarded-User"] != null && {
                "X-Forwarded-User": params["X-Forwarded-User"]
            }),
            ...(params?.["X-Forwarded-Email"] != null && {
                "X-Forwarded-Email": params["X-Forwarded-Email"]
            }),
            ...(params?.["X-Request-Id"] != null && {
                "X-Request-Id": params["X-Request-Id"]
            }),
            ...(params?.["X-Forwarded-Access-Token"] != null && {
                "X-Forwarded-Access-Token": params["X-Forwarded-Access-Token"]
            }),
            ...options?.headers
        }
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export const currentUserKey = (params?: CurrentUserParams)=>{
    return [
        "/api/current-user",
        params
    ] as const;
};
export function useCurrentUser<TData = {
    data: unknown;
}>(options?: {
    params?: CurrentUserParams;
    query?: Omit<UseQueryOptions<{
        data: unknown;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useQuery({
        queryKey: currentUserKey(options?.params),
        queryFn: ()=>currentUser(options?.params),
        ...options?.query
    });
}
export function useCurrentUserSuspense<TData = {
    data: unknown;
}>(options?: {
    params?: CurrentUserParams;
    query?: Omit<UseSuspenseQueryOptions<{
        data: unknown;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useSuspenseQuery({
        queryKey: currentUserKey(options?.params),
        queryFn: ()=>currentUser(options?.params),
        ...options?.query
    });
}
export interface ListGenieSpacesParams {
    "X-Forwarded-Host"?: string | null;
    "X-Forwarded-Preferred-Username"?: string | null;
    "X-Forwarded-User"?: string | null;
    "X-Forwarded-Email"?: string | null;
    "X-Request-Id"?: string | null;
    "X-Forwarded-Access-Token"?: string | null;
}
export const listGenieSpaces = async (params?: ListGenieSpacesParams, options?: RequestInit): Promise<{
    data: GenieSpaceListOut;
}> =>{
    const res = await fetch("/api/genie/spaces", {
        ...options,
        method: "GET",
        headers: {
            ...(params?.["X-Forwarded-Host"] != null && {
                "X-Forwarded-Host": params["X-Forwarded-Host"]
            }),
            ...(params?.["X-Forwarded-Preferred-Username"] != null && {
                "X-Forwarded-Preferred-Username": params["X-Forwarded-Preferred-Username"]
            }),
            ...(params?.["X-Forwarded-User"] != null && {
                "X-Forwarded-User": params["X-Forwarded-User"]
            }),
            ...(params?.["X-Forwarded-Email"] != null && {
                "X-Forwarded-Email": params["X-Forwarded-Email"]
            }),
            ...(params?.["X-Request-Id"] != null && {
                "X-Request-Id": params["X-Request-Id"]
            }),
            ...(params?.["X-Forwarded-Access-Token"] != null && {
                "X-Forwarded-Access-Token": params["X-Forwarded-Access-Token"]
            }),
            ...options?.headers
        }
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export const listGenieSpacesKey = (params?: ListGenieSpacesParams)=>{
    return [
        "/api/genie/spaces",
        params
    ] as const;
};
export function useListGenieSpaces<TData = {
    data: GenieSpaceListOut;
}>(options?: {
    params?: ListGenieSpacesParams;
    query?: Omit<UseQueryOptions<{
        data: GenieSpaceListOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useQuery({
        queryKey: listGenieSpacesKey(options?.params),
        queryFn: ()=>listGenieSpaces(options?.params),
        ...options?.query
    });
}
export function useListGenieSpacesSuspense<TData = {
    data: GenieSpaceListOut;
}>(options?: {
    params?: ListGenieSpacesParams;
    query?: Omit<UseSuspenseQueryOptions<{
        data: GenieSpaceListOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useSuspenseQuery({
        queryKey: listGenieSpacesKey(options?.params),
        queryFn: ()=>listGenieSpaces(options?.params),
        ...options?.query
    });
}
export interface StartConversationParams {
    space_id: string;
    "X-Forwarded-Host"?: string | null;
    "X-Forwarded-Preferred-Username"?: string | null;
    "X-Forwarded-User"?: string | null;
    "X-Forwarded-Email"?: string | null;
    "X-Request-Id"?: string | null;
    "X-Forwarded-Access-Token"?: string | null;
}
export const startConversation = async (params: StartConversationParams, data: StartConversationRequest, options?: RequestInit): Promise<{
    data: GenieConversationOut;
}> =>{
    const res = await fetch(`/api/genie/spaces/${params.space_id}/conversations`, {
        ...options,
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(params?.["X-Forwarded-Host"] != null && {
                "X-Forwarded-Host": params["X-Forwarded-Host"]
            }),
            ...(params?.["X-Forwarded-Preferred-Username"] != null && {
                "X-Forwarded-Preferred-Username": params["X-Forwarded-Preferred-Username"]
            }),
            ...(params?.["X-Forwarded-User"] != null && {
                "X-Forwarded-User": params["X-Forwarded-User"]
            }),
            ...(params?.["X-Forwarded-Email"] != null && {
                "X-Forwarded-Email": params["X-Forwarded-Email"]
            }),
            ...(params?.["X-Request-Id"] != null && {
                "X-Request-Id": params["X-Request-Id"]
            }),
            ...(params?.["X-Forwarded-Access-Token"] != null && {
                "X-Forwarded-Access-Token": params["X-Forwarded-Access-Token"]
            }),
            ...options?.headers
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export function useStartConversation(options?: {
    mutation?: UseMutationOptions<{
        data: GenieConversationOut;
    }, ApiError, {
        params: StartConversationParams;
        data: StartConversationRequest;
    }>;
}) {
    return useMutation({
        mutationFn: (vars)=>startConversation(vars.params, vars.data),
        ...options?.mutation
    });
}
export interface SendMessageParams {
    space_id: string;
    conversation_id: string;
    "X-Forwarded-Host"?: string | null;
    "X-Forwarded-Preferred-Username"?: string | null;
    "X-Forwarded-User"?: string | null;
    "X-Forwarded-Email"?: string | null;
    "X-Request-Id"?: string | null;
    "X-Forwarded-Access-Token"?: string | null;
}
export const sendMessage = async (params: SendMessageParams, data: SendMessageRequest, options?: RequestInit): Promise<{
    data: GenieMessageOut;
}> =>{
    const res = await fetch(`/api/genie/spaces/${params.space_id}/conversations/${params.conversation_id}/messages`, {
        ...options,
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(params?.["X-Forwarded-Host"] != null && {
                "X-Forwarded-Host": params["X-Forwarded-Host"]
            }),
            ...(params?.["X-Forwarded-Preferred-Username"] != null && {
                "X-Forwarded-Preferred-Username": params["X-Forwarded-Preferred-Username"]
            }),
            ...(params?.["X-Forwarded-User"] != null && {
                "X-Forwarded-User": params["X-Forwarded-User"]
            }),
            ...(params?.["X-Forwarded-Email"] != null && {
                "X-Forwarded-Email": params["X-Forwarded-Email"]
            }),
            ...(params?.["X-Request-Id"] != null && {
                "X-Request-Id": params["X-Request-Id"]
            }),
            ...(params?.["X-Forwarded-Access-Token"] != null && {
                "X-Forwarded-Access-Token": params["X-Forwarded-Access-Token"]
            }),
            ...options?.headers
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export function useSendMessage(options?: {
    mutation?: UseMutationOptions<{
        data: GenieMessageOut;
    }, ApiError, {
        params: SendMessageParams;
        data: SendMessageRequest;
    }>;
}) {
    return useMutation({
        mutationFn: (vars)=>sendMessage(vars.params, vars.data),
        ...options?.mutation
    });
}
export interface GetMessageParams {
    space_id: string;
    conversation_id: string;
    message_id: string;
    "X-Forwarded-Host"?: string | null;
    "X-Forwarded-Preferred-Username"?: string | null;
    "X-Forwarded-User"?: string | null;
    "X-Forwarded-Email"?: string | null;
    "X-Request-Id"?: string | null;
    "X-Forwarded-Access-Token"?: string | null;
}
export const getMessage = async (params: GetMessageParams, options?: RequestInit): Promise<{
    data: GenieMessageOut;
}> =>{
    const res = await fetch(`/api/genie/spaces/${params.space_id}/conversations/${params.conversation_id}/messages/${params.message_id}`, {
        ...options,
        method: "GET",
        headers: {
            ...(params?.["X-Forwarded-Host"] != null && {
                "X-Forwarded-Host": params["X-Forwarded-Host"]
            }),
            ...(params?.["X-Forwarded-Preferred-Username"] != null && {
                "X-Forwarded-Preferred-Username": params["X-Forwarded-Preferred-Username"]
            }),
            ...(params?.["X-Forwarded-User"] != null && {
                "X-Forwarded-User": params["X-Forwarded-User"]
            }),
            ...(params?.["X-Forwarded-Email"] != null && {
                "X-Forwarded-Email": params["X-Forwarded-Email"]
            }),
            ...(params?.["X-Request-Id"] != null && {
                "X-Request-Id": params["X-Request-Id"]
            }),
            ...(params?.["X-Forwarded-Access-Token"] != null && {
                "X-Forwarded-Access-Token": params["X-Forwarded-Access-Token"]
            }),
            ...options?.headers
        }
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export const getMessageKey = (params?: GetMessageParams)=>{
    return [
        "/api/genie/spaces/{space_id}/conversations/{conversation_id}/messages/{message_id}",
        params
    ] as const;
};
export function useGetMessage<TData = {
    data: GenieMessageOut;
}>(options: {
    params: GetMessageParams;
    query?: Omit<UseQueryOptions<{
        data: GenieMessageOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useQuery({
        queryKey: getMessageKey(options.params),
        queryFn: ()=>getMessage(options.params),
        ...options?.query
    });
}
export function useGetMessageSuspense<TData = {
    data: GenieMessageOut;
}>(options: {
    params: GetMessageParams;
    query?: Omit<UseSuspenseQueryOptions<{
        data: GenieMessageOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useSuspenseQuery({
        queryKey: getMessageKey(options.params),
        queryFn: ()=>getMessage(options.params),
        ...options?.query
    });
}
export interface GetQueryResultParams {
    space_id: string;
    conversation_id: string;
    message_id: string;
    attachment_id: string;
    "X-Forwarded-Host"?: string | null;
    "X-Forwarded-Preferred-Username"?: string | null;
    "X-Forwarded-User"?: string | null;
    "X-Forwarded-Email"?: string | null;
    "X-Request-Id"?: string | null;
    "X-Forwarded-Access-Token"?: string | null;
}
export const getQueryResult = async (params: GetQueryResultParams, options?: RequestInit): Promise<{
    data: GenieQueryResultOut;
}> =>{
    const res = await fetch(`/api/genie/spaces/${params.space_id}/conversations/${params.conversation_id}/messages/${params.message_id}/query-result/${params.attachment_id}`, {
        ...options,
        method: "GET",
        headers: {
            ...(params?.["X-Forwarded-Host"] != null && {
                "X-Forwarded-Host": params["X-Forwarded-Host"]
            }),
            ...(params?.["X-Forwarded-Preferred-Username"] != null && {
                "X-Forwarded-Preferred-Username": params["X-Forwarded-Preferred-Username"]
            }),
            ...(params?.["X-Forwarded-User"] != null && {
                "X-Forwarded-User": params["X-Forwarded-User"]
            }),
            ...(params?.["X-Forwarded-Email"] != null && {
                "X-Forwarded-Email": params["X-Forwarded-Email"]
            }),
            ...(params?.["X-Request-Id"] != null && {
                "X-Request-Id": params["X-Request-Id"]
            }),
            ...(params?.["X-Forwarded-Access-Token"] != null && {
                "X-Forwarded-Access-Token": params["X-Forwarded-Access-Token"]
            }),
            ...options?.headers
        }
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export const getQueryResultKey = (params?: GetQueryResultParams)=>{
    return [
        "/api/genie/spaces/{space_id}/conversations/{conversation_id}/messages/{message_id}/query-result/{attachment_id}",
        params
    ] as const;
};
export function useGetQueryResult<TData = {
    data: GenieQueryResultOut;
}>(options: {
    params: GetQueryResultParams;
    query?: Omit<UseQueryOptions<{
        data: GenieQueryResultOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useQuery({
        queryKey: getQueryResultKey(options.params),
        queryFn: ()=>getQueryResult(options.params),
        ...options?.query
    });
}
export function useGetQueryResultSuspense<TData = {
    data: GenieQueryResultOut;
}>(options: {
    params: GetQueryResultParams;
    query?: Omit<UseSuspenseQueryOptions<{
        data: GenieQueryResultOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useSuspenseQuery({
        queryKey: getQueryResultKey(options.params),
        queryFn: ()=>getQueryResult(options.params),
        ...options?.query
    });
}
export interface ListQueueParams {
    status?: string | null;
    limit?: number;
    offset?: number;
    "X-Forwarded-Host"?: string | null;
    "X-Forwarded-Preferred-Username"?: string | null;
    "X-Forwarded-User"?: string | null;
    "X-Forwarded-Email"?: string | null;
    "X-Request-Id"?: string | null;
    "X-Forwarded-Access-Token"?: string | null;
}
export const listQueue = async (params?: ListQueueParams, options?: RequestInit): Promise<{
    data: QueueListOut;
}> =>{
    const searchParams = new URLSearchParams();
    if (params?.status != null) searchParams.set("status", String(params?.status));
    if (params?.limit != null) searchParams.set("limit", String(params?.limit));
    if (params?.offset != null) searchParams.set("offset", String(params?.offset));
    const queryString = searchParams.toString();
    const url = queryString ? `/api/queue?${queryString}` : "/api/queue";
    const res = await fetch(url, {
        ...options,
        method: "GET",
        headers: {
            ...(params?.["X-Forwarded-Host"] != null && {
                "X-Forwarded-Host": params["X-Forwarded-Host"]
            }),
            ...(params?.["X-Forwarded-Preferred-Username"] != null && {
                "X-Forwarded-Preferred-Username": params["X-Forwarded-Preferred-Username"]
            }),
            ...(params?.["X-Forwarded-User"] != null && {
                "X-Forwarded-User": params["X-Forwarded-User"]
            }),
            ...(params?.["X-Forwarded-Email"] != null && {
                "X-Forwarded-Email": params["X-Forwarded-Email"]
            }),
            ...(params?.["X-Request-Id"] != null && {
                "X-Request-Id": params["X-Request-Id"]
            }),
            ...(params?.["X-Forwarded-Access-Token"] != null && {
                "X-Forwarded-Access-Token": params["X-Forwarded-Access-Token"]
            }),
            ...options?.headers
        }
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export const listQueueKey = (params?: ListQueueParams)=>{
    return [
        "/api/queue",
        params
    ] as const;
};
export function useListQueue<TData = {
    data: QueueListOut;
}>(options?: {
    params?: ListQueueParams;
    query?: Omit<UseQueryOptions<{
        data: QueueListOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useQuery({
        queryKey: listQueueKey(options?.params),
        queryFn: ()=>listQueue(options?.params),
        ...options?.query
    });
}
export function useListQueueSuspense<TData = {
    data: QueueListOut;
}>(options?: {
    params?: ListQueueParams;
    query?: Omit<UseSuspenseQueryOptions<{
        data: QueueListOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useSuspenseQuery({
        queryKey: listQueueKey(options?.params),
        queryFn: ()=>listQueue(options?.params),
        ...options?.query
    });
}
export const clearQueue = async (options?: RequestInit): Promise<{
    data: ClearQueueOut;
}> =>{
    const res = await fetch("/api/queue/clear", {
        ...options,
        method: "DELETE"
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export function useClearQueue(options?: {
    mutation?: UseMutationOptions<{
        data: ClearQueueOut;
    }, ApiError, void>;
}) {
    return useMutation({
        mutationFn: ()=>clearQueue(),
        ...options?.mutation
    });
}
export interface SimulateQueueParams {
    "X-Forwarded-Host"?: string | null;
    "X-Forwarded-Preferred-Username"?: string | null;
    "X-Forwarded-User"?: string | null;
    "X-Forwarded-Email"?: string | null;
    "X-Request-Id"?: string | null;
    "X-Forwarded-Access-Token"?: string | null;
}
export const simulateQueue = async (data: SimulateQueueRequest, params?: SimulateQueueParams, options?: RequestInit): Promise<{
    data: QueuedResponseOut[];
}> =>{
    const res = await fetch("/api/queue/simulate", {
        ...options,
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(params?.["X-Forwarded-Host"] != null && {
                "X-Forwarded-Host": params["X-Forwarded-Host"]
            }),
            ...(params?.["X-Forwarded-Preferred-Username"] != null && {
                "X-Forwarded-Preferred-Username": params["X-Forwarded-Preferred-Username"]
            }),
            ...(params?.["X-Forwarded-User"] != null && {
                "X-Forwarded-User": params["X-Forwarded-User"]
            }),
            ...(params?.["X-Forwarded-Email"] != null && {
                "X-Forwarded-Email": params["X-Forwarded-Email"]
            }),
            ...(params?.["X-Request-Id"] != null && {
                "X-Request-Id": params["X-Request-Id"]
            }),
            ...(params?.["X-Forwarded-Access-Token"] != null && {
                "X-Forwarded-Access-Token": params["X-Forwarded-Access-Token"]
            }),
            ...options?.headers
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export function useSimulateQueue(options?: {
    mutation?: UseMutationOptions<{
        data: QueuedResponseOut[];
    }, ApiError, {
        params: SimulateQueueParams;
        data: SimulateQueueRequest;
    }>;
}) {
    return useMutation({
        mutationFn: (vars)=>simulateQueue(vars.data, vars.params),
        ...options?.mutation
    });
}
export const getQueueStats = async (options?: RequestInit): Promise<{
    data: unknown;
}> =>{
    const res = await fetch("/api/queue/stats", {
        ...options,
        method: "GET"
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export const getQueueStatsKey = ()=>{
    return [
        "/api/queue/stats"
    ] as const;
};
export function useGetQueueStats<TData = {
    data: unknown;
}>(options?: {
    query?: Omit<UseQueryOptions<{
        data: unknown;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useQuery({
        queryKey: getQueueStatsKey(),
        queryFn: ()=>getQueueStats(),
        ...options?.query
    });
}
export function useGetQueueStatsSuspense<TData = {
    data: unknown;
}>(options?: {
    query?: Omit<UseSuspenseQueryOptions<{
        data: unknown;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useSuspenseQuery({
        queryKey: getQueueStatsKey(),
        queryFn: ()=>getQueueStats(),
        ...options?.query
    });
}
export interface GetQueueItemParams {
    request_id: string;
}
export const getQueueItem = async (params: GetQueueItemParams, options?: RequestInit): Promise<{
    data: QueueItemOut;
}> =>{
    const res = await fetch(`/api/queue/${params.request_id}`, {
        ...options,
        method: "GET"
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export const getQueueItemKey = (params?: GetQueueItemParams)=>{
    return [
        "/api/queue/{request_id}",
        params
    ] as const;
};
export function useGetQueueItem<TData = {
    data: QueueItemOut;
}>(options: {
    params: GetQueueItemParams;
    query?: Omit<UseQueryOptions<{
        data: QueueItemOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useQuery({
        queryKey: getQueueItemKey(options.params),
        queryFn: ()=>getQueueItem(options.params),
        ...options?.query
    });
}
export function useGetQueueItemSuspense<TData = {
    data: QueueItemOut;
}>(options: {
    params: GetQueueItemParams;
    query?: Omit<UseSuspenseQueryOptions<{
        data: QueueItemOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useSuspenseQuery({
        queryKey: getQueueItemKey(options.params),
        queryFn: ()=>getQueueItem(options.params),
        ...options?.query
    });
}
export const version = async (options?: RequestInit): Promise<{
    data: VersionOut;
}> =>{
    const res = await fetch("/api/version", {
        ...options,
        method: "GET"
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export const versionKey = ()=>{
    return [
        "/api/version"
    ] as const;
};
export function useVersion<TData = {
    data: VersionOut;
}>(options?: {
    query?: Omit<UseQueryOptions<{
        data: VersionOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useQuery({
        queryKey: versionKey(),
        queryFn: ()=>version(),
        ...options?.query
    });
}
export function useVersionSuspense<TData = {
    data: VersionOut;
}>(options?: {
    query?: Omit<UseSuspenseQueryOptions<{
        data: VersionOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useSuspenseQuery({
        queryKey: versionKey(),
        queryFn: ()=>version(),
        ...options?.query
    });
}
