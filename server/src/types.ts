export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  is_admin: number;
  telegram_chat_id: string | null;
  telegram_link_code: string | null;
  created_at: string;
}

export interface PublicUser {
  id: number;
  username: string;
  isAdmin: boolean;
  telegramLinked: boolean;
}

export interface LocationRow {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  cloud_cover_threshold: number;
  precipitation_probability_threshold: number;
  enabled_models: string;
  created_by: number;
  created_at: string;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    isAdmin: !!row.is_admin,
    telegramLinked: !!row.telegram_chat_id,
  };
}
