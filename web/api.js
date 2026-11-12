let session = null;
export function currentSession() {
  return session;
}
export async function getSession() {
  session = await request('/api/session');
  return session;
}
export async function request(path, body, options = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    if (session?.csrfToken) headers['X-CSRF-Token'] = session.csrfToken;
  }
  let response;
  try {
    response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('The bench lost its connection. Try again when you are back online.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      typeof payload.error === 'string'
        ? payload.error
        : payload.error?.message || 'The request could not be completed.',
    );
    error.status = response.status;
    error.state = payload.state;
    error.retryAfter = response.headers.get('Retry-After');
    throw error;
  }
  return payload;
}
export const commandId = () => crypto.randomUUID();
