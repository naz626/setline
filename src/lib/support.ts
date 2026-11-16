/** The address people write to for help, or undefined until SUPPORT_EMAIL is set. */
export function supportEmail(env = process.env): string | undefined {
  return env.SUPPORT_EMAIL?.trim() || undefined;
}
