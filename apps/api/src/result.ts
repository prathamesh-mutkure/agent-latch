export type Failure = {
  ok: false;
  status: 400 | 403 | 404 | 409 | 503;
  error: string;
};

export type Success<T> = {
  ok: true;
  value: T;
};

export function respond<T>(
  set: { status?: number | string },
  result: Success<T> | Failure,
): T | { error: string } {
  if (!result.ok) {
    set.status = result.status;
    return { error: result.error };
  }
  return result.value;
}
