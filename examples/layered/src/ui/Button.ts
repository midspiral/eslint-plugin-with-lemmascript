// A UI component. It imports a SERVICE — which looks innocent. There is NO
// direct import of the DB layer anywhere in ui/. But `services/format` imports
// `db/client`, so the UI transitively depends on the DB: ui → services → db.
// One-hop linters see only `ui/Button → services/format` and pass.
import { format } from '../services/format';
import { log } from '../util/log';

export function Button(id: string): string {
  log('render button');
  return '<button>' + format(id) + '</button>';
}
