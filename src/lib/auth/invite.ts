export function inviteUsable(
  invite: { expiresAt: Date; maxUses: number; uses: number },
  now: Date = new Date(),
): boolean {
  return invite.expiresAt > now && invite.uses < invite.maxUses;
}
