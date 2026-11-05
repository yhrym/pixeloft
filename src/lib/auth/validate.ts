import { MIN_PASSWORD_LENGTH } from "./password.ts";

export const MAX_LOGIN_ID_LENGTH = 32;
export const MAX_PASSWORD_LENGTH = 1000;

/** 問題なければnull、駄目ならi18nキー（error.以降）を返す */
export function validateNewUser(loginId: string, name: string, password: string): string | null {
  if (!/^[a-z0-9_.-]{3,32}$/.test(loginId)) return "loginId";
  if (name.length < 1 || name.length > 40) return "name";
  return validatePassword(password);
}

export function validatePassword(password: string): string | null {
  // 上限はscryptに巨大な入力を渡させないためだけの値
  return password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH ? "password" : null;
}
