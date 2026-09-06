import type { AiExecutionMeta } from "./types";
import type { ApiMeta, ApiResult } from "./workspace-types";

interface ApiEnvelope<T> {
  ok?: boolean;
  data?: T;
  error?: { message?: string; code?: string; requestId?: string };
  meta?: ApiMeta;
}

/** 带 HTTP 状态、业务 code 与 requestId 的 API 错误，供调用方按类别处理，不依赖字符串匹配。 */
export class ApiError extends Error {
  status: number;
  code: string;
  requestId?: string;
  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

/** 安全解析 API 响应体；HTTP 错误、空 body 或非法 JSON 时返回 null（不抛异常） */
export async function readApiJson<T = unknown>(response: Response): Promise<ApiEnvelope<T> | null> {
  try {
    return (await response.json()) as ApiEnvelope<T>;
  } catch {
    return null;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException ? error.name === "AbortError"
    : (error instanceof Error && error.name === "AbortError");
}

/** 按 HTTP 状态给出稳定的业务 code，供 UI 分类（401→登录，403→权限，409→冲突，422→补齐，429→限流，5xx→保留现场）。 */
function errorCodeForStatus(status: number): string {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 422) return "INCOMPLETE_INPUT";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "SERVER_ERROR";
  return "HTTP_ERROR";
}

function defaultMessageForStatus(status: number): string {
  if (status === 401) return "登录已过期，请重新登录";
  if (status === 403) return "没有权限执行此操作";
  if (status === 404) return "请求的资源不存在";
  if (status === 409) return "资料已变化，请重新生成建议";
  if (status === 422) return "信息不完整，请补充后重试";
  if (status === 429) return "操作过于频繁，请稍后重试";
  if (status >= 500) return "服务暂时不可用，请稍后重试";
  return "操作失败，请稍后重试";
}

/** 从一次 HTTP 响应归一化出可判别结果：分开 HTTP 错误与 body.ok，空/非法 JSON 归一化，网络失败与取消分别处理。 */
export async function apiResultFromResponse<T>(response: Response): Promise<ApiResult<T>> {
  const status = response.status;
  const body = await readApiJson<ApiEnvelope<T>>(response);
  if (!response.ok) {
    return {
      ok: false,
      status,
      error: {
        code: body?.error?.code ?? errorCodeForStatus(status),
        message: body?.error?.message ?? defaultMessageForStatus(status),
        requestId: body?.error?.requestId,
      },
    };
  }
  if (!body?.ok) {
    // HTTP 200 但业务失败（如校验不通过）
    return {
      ok: false,
      status,
      error: {
        code: body?.error?.code ?? "BUSINESS_ERROR",
        message: body?.error?.message ?? defaultMessageForStatus(status),
        requestId: body?.error?.requestId,
      },
    };
  }
  return { ok: true, status, data: body.data as T, meta: body.meta };
}

/** 只保证成功返回；失败时抛出带 status/code/requestId 的 ApiError，供调用方按类别捕获。 */
export async function requireApiOk<T = unknown>(response: Response): Promise<T> {
  const result = await apiResultFromResponse<T>(response);
  if (!result.ok) {
    // 保留错误字段供调用方区分（401 触发登录、409 版本冲突等）；AbortError 不在此处抛出。
    throw new ApiError(result.status, result.error.code, result.error.message, result.error.requestId);
  }
  return result.data;
}

/** 工作台通用 fetch 封装：统一 JSON Content-Type，并把 HTTP/业务/网络/取消归一化为 ApiResult。mutation 不在此自动重放。 */
export async function fetchApi<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    if (isAbortError(error)) {
      return { ok: false, status: 0, error: { code: "ABORTED", message: "请求已取消" } };
    }
    return { ok: false, status: 0, error: { code: "NETWORK_ERROR", message: "网络异常，请检查连接后重试" } };
  }
  return apiResultFromResponse<T>(response);
}

/** 从通用 meta 中安全提取 AI 执行信息：优先用 aiExecution，缺省时兼容旧接口平铺的顶层字段。 */
export function extractAiExecutionMeta(meta: ApiMeta | undefined): AiExecutionMeta | null {
  if (!meta) return null;
  if (meta.aiExecution) return meta.aiExecution;
  if (meta.requestedMode && meta.actualMode && meta.degraded !== undefined) {
    return {
      requestedMode: meta.requestedMode,
      actualMode: meta.actualMode,
      degraded: meta.degraded,
      fallbackReason: meta.fallbackReason ?? null,
      source: meta.source ?? "unknown",
    };
  }
  return null;
}
