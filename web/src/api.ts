import { Location, NightForecast, PublicUser, Recipient } from './types';

class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  }
  return res.json() as Promise<T>;
}

export const api = {
  needsSetup: () => request<{ needsSetup: boolean }>('/auth/needs-setup'),
  bootstrap: (username: string, password: string) =>
    request<{ user: PublicUser }>('/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ user: PublicUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: PublicUser }>('/auth/me'),

  listLocations: () => request<{ locations: Location[] }>('/locations'),
  createLocation: (data: Partial<Location>) =>
    request<{ location: Location }>('/locations', { method: 'POST', body: JSON.stringify(data) }),
  updateLocation: (id: number, data: Partial<Location>) =>
    request<{ location: Location }>(`/locations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteLocation: (id: number) =>
    request<{ ok: boolean }>(`/locations/${id}`, { method: 'DELETE' }),
  addRecipient: (locationId: number, name: string) =>
    request<{ recipient: Recipient; code: string }>(`/locations/${locationId}/recipients`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  removeRecipient: (locationId: number, recipientId: number) =>
    request<{ ok: boolean }>(`/locations/${locationId}/recipients/${recipientId}`, {
      method: 'DELETE',
    }),
  regenerateRecipientLink: (locationId: number, recipientId: number) =>
    request<{ code: string }>(
      `/locations/${locationId}/recipients/${recipientId}/telegram-link`,
      { method: 'POST' }
    ),
  getForecast: (id: number) =>
    request<{ nights: NightForecast[] }>(`/locations/${id}/forecast`),

  telegramStatus: () =>
    request<{ enabled: boolean; botUsername: string | null; linked: boolean }>(
      '/telegram/status'
    ),
  telegramLink: () => request<{ code: string }>('/telegram/link', { method: 'POST' }),
  telegramUnlink: () => request<{ ok: boolean }>('/telegram/link', { method: 'DELETE' }),
};

export { ApiError };
