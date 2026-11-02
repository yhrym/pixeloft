/** パーツを直す・消せるのは、描いた本人と管理者だけ(サーバーが毎回確かめる) */
export const canModifyPart = (user: { id: string; role: string }, part: { createdById: string }): boolean =>
  user.role === "admin" || user.id === part.createdById;
