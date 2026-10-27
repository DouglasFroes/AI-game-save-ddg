import { isNoticePending, publishNotice, retractNotice } from '@/platform/notices';

interface Env {
  addEventListener(type: 'offline' | 'online', listener: () => void): void;
  navigator?: { onLine: boolean };
}

const KEY = 'connection';

/**
 * Tells the player when the connection drops (their scores keep being saved on the device),
 * withdraws that notice if the connection is back before it was ever shown, or confirms that
 * the connection is back if the offline warning was already displayed.
 */
export function bindConnectivityNotices(env: Env = window): void {
  let warnedOffline = false;
  const offline = () => {
    warnedOffline = true;
    publishNotice({
      key: KEY,
      kind: 'warn',
      category: 'system',
      glyph: 'globe',
      title: 'Você está offline',
      body: 'Pode continuar jogando: seus recordes ficam salvos e sobem quando a internet voltar.',
    });
  };
  const online = () => {
    const stillPending = isNoticePending(KEY);
    retractNotice(KEY);
    if (warnedOffline && !stillPending) {
      warnedOffline = false;
      publishNotice({
        key: 'connection-online',
        kind: 'success',
        category: 'system',
        glyph: 'check',
        ephemeral: true,
        title: 'Conexão restaurada',
        body: 'Você está online novamente.',
      });
    } else {
      warnedOffline = false;
    }
  };
  env.addEventListener('offline', offline);
  env.addEventListener('online', online);
  if (env.navigator && !env.navigator.onLine) offline();
}
