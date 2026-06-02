import { Button } from './Button';
import { log } from '../util/log';

export function App(): string {
  log('render app');
  return '<div>' + Button('42') + '</div>';
}
