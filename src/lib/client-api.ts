interface ApiEnvelope<T> {
  ok?: boolean;
  data?: T;
  error?: { message?: string };
}

export async function requireApiOk<T = unknown>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !body?.ok) {
    throw new Error(body?.error?.message ?? "操作失败，请稍后重试");
  }
  return body.data as T;
}
