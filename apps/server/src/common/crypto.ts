import * as bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export function hashSecret(value: string): Promise<string> {
  return bcrypt.hash(value, SALT_ROUNDS);
}
