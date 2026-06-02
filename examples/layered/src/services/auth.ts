// Another service that uses the DB — fine, services may.
import { query } from '../db/client';

export function checkAuth(token: string): boolean {
  return query('select 1').length >= 0 && token.length > 0;
}
