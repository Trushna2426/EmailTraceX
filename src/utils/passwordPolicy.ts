export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 1024;

export function validateRegistrationPassword(password: string): string | null {
  if (Array.from(password).length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    return `Password must not exceed ${MAX_PASSWORD_BYTES} UTF-8 bytes.`;
  }
  return null;
}
