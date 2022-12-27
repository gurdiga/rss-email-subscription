import { join } from 'node:path';

export function makePath(...segments: string[]): string {
  return join(...segments);
}
