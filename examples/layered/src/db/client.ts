// The DB layer. The UI must never depend on this — directly OR transitively.
import { log } from '../util/log';

export function query(sql: string): unknown[] {
  log('db query: ' + sql);
  return [];
}
