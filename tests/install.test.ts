import { describe, expect, it } from 'vitest';
import { InstallPrompt, iosInstallSteps, type InstallEnv } from '@/platform/pwa/install';
import { retractNotice } from '@/platform/notices';

const setup = (
  opts: { standalone?: boolean; ua?: string; platform?: string; touch?: number } = {},
) => {
  const handlers = new Map<string, (e: Event) => void>();
  const env: InstallEnv = {
    addEventListener: (t, l) => void handlers.set(t, l),
    isStandalone: () => opts.standalone ?? false,
    userAgent: opts.ua ?? 'Mozilla/5.0 (Linux; Android 14) Chrome/130',
    platform: opts.platform,
    maxTouchPoints: opts.touch,
  };
  const fire = (type: string, event: Event = new Event(type)) => handlers.get(type)!(event);
  return { install: new InstallPrompt(env), fire };
};

const promptEvent = (outcome: 'accepted' | 'dismissed') => {
  const e = new Event('beforeinstallprompt') as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
    prompted: number;
  };
  e.prompted = 0;
  e.prompt = async () => void e.prompted++;
  e.userChoice = Promise.resolve({ outcome });
  return e;
};

describe('InstallPrompt', () => {
  it('offers nothing until the browser says the app is installable', () => {
    const { install, fire } = setup();
    expect(install.state()).toBe('unavailable');
    fire('beforeinstallprompt', promptEvent('accepted'));
    expect(install.state()).toBe('prompt');
  });

  it('shows the browser dialog once and reports the choice', async () => {
    const { install, fire } = setup();
    const e = promptEvent('accepted');
    fire('beforeinstallprompt', e);
    expect(await install.prompt()).toBe('accepted');
    expect(e.prompted).toBe(1);
    expect(install.state()).toBe('unavailable');
    expect(await install.prompt()).toBe('unavailable');
  });

  it('points iPhone players to the share sheet instead', () => {
    expect(setup({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' }).install.state()).toBe('ios');
  });

  it('hides the button inside the installed app and after installing', () => {
    expect(setup({ standalone: true }).install.state()).toBe('installed');
    const { install, fire } = setup();
    fire('beforeinstallprompt', promptEvent('accepted'));
    fire('appinstalled');
    expect(install.state()).toBe('installed');
    retractNotice('installed');
  });

  it('tells listeners when the state changes', () => {
    const { install, fire } = setup();
    let calls = 0;
    install.onChange(() => calls++);
    fire('beforeinstallprompt', promptEvent('dismissed'));
    expect(calls).toBe(1);
  });
});

describe('iOS detection', () => {
  const mac =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
  it('sees an iPhone in "desktop site" mode by its touch screen', () => {
    expect(setup({ ua: mac, platform: 'MacIntel', touch: 5 }).install.state()).toBe('ios');
  });
  it('does not mistake a real Mac for an iPhone', () => {
    expect(setup({ ua: mac, platform: 'MacIntel', touch: 0 }).install.state()).toBe('unavailable');
  });
});

describe('iosInstallSteps', () => {
  it('points to the address bar in Chrome and to the bottom bar in Safari', () => {
    expect(iosInstallSteps('Mozilla/5.0 (iPhone) CriOS/130 Mobile Safari')[0]).toContain(
      'barra de endereço',
    );
    expect(iosInstallSteps('Mozilla/5.0 (iPhone) Version/17 Mobile Safari')[0]).toContain(
      'barra de baixo',
    );
  });
});
