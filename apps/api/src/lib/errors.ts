export function apiError(
  message: string,
  status: number = 400,
  code?: string
): Response {
  return Response.json({ error: message, ...(code && { code }) }, { status });
}

export function ok<T>(data: T, status: number = 200): Response {
  return Response.json(data, { status });
}
