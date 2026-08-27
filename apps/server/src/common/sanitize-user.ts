import { User } from '@prisma/client';

export function sanitizeUser<T extends Pick<User, keyof User>>(user: T) {
  const { passwordHash, pinHash, ...safe } = user;
  void passwordHash;
  void pinHash;
  return safe;
}
