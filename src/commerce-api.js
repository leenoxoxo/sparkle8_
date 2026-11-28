export async function api(path, method = 'GET', body, {signal} = {}) {
  const binary = body instanceof Blob;
  const response = await fetch('/api' + path, {
    method,
    signal,
    headers: body === undefined ? undefined : {'Content-Type': binary ? 'application/octet-stream' : 'application/json'},
    body: body === undefined ? undefined : binary ? body : JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw Object.assign(new Error(data?.error || 'service_unavailable'), {status: response.status});
  return data;
}

export const ils = cents => '₪' + (cents / 100).toFixed(2);
