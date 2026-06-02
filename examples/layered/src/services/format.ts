// A service. It legitimately talks to the DB — services are allowed to.
// This is the LAUNDERING HOP: the UI imports this, and this imports the DB.
import { query } from '../db/client';
import { log } from '../util/log';

export function format(id: string): string {
  log('format ' + id);
  const rows = query('select * from users where id = ' + id);
  return String(rows.length);
}
