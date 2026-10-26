import type Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { HUB_FONT } from '@/platform/fonts';
import { getServices } from '@/services';
import { CTA, GLASS_PILL, glowBlob, pillArt, UI } from './hubTheme';
import { drawIcon } from './icons';
import { askName, pillButton } from './nameDialog';
import { addText } from './widgets';

const text = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  value: string,
  size: number,
  color: string,
  weight: 'normal' | 'bold' = 'bold',
  wrap?: number,
) =>
  addText(scene, x, y, value, size, {
    color,
    weight,
    family: HUB_FONT,
    ...(wrap ? { wrapWidth: wrap, align: 'center' } : {}),
  });

/** The four-colour "G", drawn as text so nothing has to be loaded. */
function googleMark(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  g.fillStyle(0xffffff).fillCircle(0, 0, size / 2);
  c.add([g, text(scene, 0, 1, 'G', Math.round(size * 0.62), '#4285F4')]);
  return c;
}

/**
 * The player's account: sign in with Google (required for the global ranking), sign out, or
 * change the nickname. Resolves when closed. Without a global ranking it is just the name dialog.
 */
export async function openAccount(
  scene: Phaser.Scene,
  opts: { reason?: string } = {},
): Promise<void> {
  const services = getServices(scene);
  const { account, profile } = services;
  if (!account.available) {
    const name = await askName(scene, profile.get().name);
    if (name) profile.update({ name });
    return;
  }
  return new Promise((resolve) => {
    const cx = GAME_WIDTH / 2;
    const cy = 560;
    const w = 640;
    const h = 700;
    const depth = 1000;
    const base: Phaser.GameObjects.GameObject[] = [];
    let body: Phaser.GameObjects.GameObject[] = [];
    const add = <T extends Phaser.GameObjects.GameObject & { setDepth(v: number): T }>(
      o: T,
      list: Phaser.GameObjects.GameObject[] = body,
    ): T => {
      list.push(o);
      return o.setDepth(depth);
    };
    let busy = false;
    let connecting = false;

    add(
      scene.add
        .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x03040a, 0.86)
        .setOrigin(0)
        .setInteractive(),
      base,
    );
    add(
      scene.add
        .image(cx, cy - 160, glowBlob(scene))
        .setTint(0x4285f4)
        .setScale(6)
        .setAlpha(0.3)
        .setBlendMode('ADD'),
      base,
    );
    const card = scene.add.graphics();
    card.fillStyle(0x0c0e22).fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 44);
    card.lineStyle(2, 0xffffff, 0.16).strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 44);
    add(card, base);

    const close = () => {
      if (busy) return;
      for (const o of [...body, ...base]) o.destroy();
      resolve();
    };
    const clear = () => {
      for (const o of body) o.destroy();
      body = [];
    };

    const status = (title: string, sub: string) => {
      clear();
      add(scene.add.image(cx, cy - 210, pillArt(scene, 112, 112, CTA, true)));
      add(drawIcon(scene, 'globe', cx, cy - 210, 54, 0xffffff));
      add(text(scene, cx, cy - 110, title, 34, '#ffffff'));
      add(text(scene, cx, cy - 50, sub, 22, UI.soft, 'normal', w - 100));
    };

    const changeName = () => {
      if (busy) return;
      for (const o of [...body, ...base])
        (o as unknown as { setVisible(v: boolean): void }).setVisible(false);
      void askName(scene, profile.get().name).then((name) => {
        if (name) profile.update({ name });
        for (const o of [...body, ...base])
          (o as unknown as { setVisible(v: boolean): void }).setVisible(true);
        render();
      });
    };

    const render = (note?: string) => {
      clear();
      const me = account.current();
      const name = profile.get().name || 'Jogador';
      if (me) {
        add(scene.add.image(cx, cy - 220, pillArt(scene, 112, 112, [0x34d399, 0x10b981], true)));
        add(text(scene, cx, cy - 220, [...name][0]!.toUpperCase(), 52, '#ffffff'));
        add(text(scene, cx, cy - 126, name, 38, '#ffffff'));
        add(googleMark(scene, cx - 150, cy - 70, 34));
        const mail = add(text(scene, cx + 20, cy - 70, me.email || me.name, 21, UI.soft, 'normal'));
        if (mail.width > 300) mail.setScale(300 / mail.width);
        add(
          text(
            scene,
            cx,
            cy + 10,
            note ?? 'Conectado. Seus recordes valem no ranking global e ficam salvos na sua conta.',
            21,
            note ? '#86efac' : UI.mute,
            'normal',
            w - 100,
          ),
        );
        add(
          pillButton(
            scene,
            cx,
            cy + 120,
            w - 96,
            84,
            '✎ Alterar apelido',
            28,
            GLASS_PILL,
            false,
            changeName,
          ),
        );
        add(
          pillButton(
            scene,
            cx - 140,
            cy + 230,
            250,
            84,
            'Sair da conta',
            26,
            [0x7f1d1d, 0x991b1b],
            false,
            () => {
              busy = true;
              status('Saindo…', '');
              void account.signOut().finally(() => {
                busy = false;
                render();
              });
            },
          ),
        );
        add(pillButton(scene, cx + 140, cy + 230, 250, 84, 'Fechar', 28, CTA, true, close));
        return;
      }
      add(googleMark(scene, cx, cy - 220, 104));
      add(text(scene, cx, cy - 126, 'Entre com Google', 38, '#ffffff'));
      add(
        text(
          scene,
          cx,
          cy - 46,
          opts.reason ??
            'O ranking global agora é só para quem entra com Google. Seus recordes atuais vão junto para a sua conta — nada se perde.',
          21,
          UI.soft,
          'normal',
          w - 90,
        ),
      );
      if (note) add(text(scene, cx, cy + 38, note, 20, '#ff7b9c', 'normal', w - 100));
      const ready = account.isReady;
      const signIn = add(
        pillButton(
          scene,
          cx,
          cy + 120,
          w - 96,
          92,
          ready ? 'Entrar com Google' : 'Conectando…',
          32,
          [0xffffff, 0xe2e8f0],
          true,
          () => {
            if (busy || !account.isReady) return;
            busy = true;
            // The popup opens inside this tap: nothing may be awaited before signIn().
            const pending = account.signIn();
            status(
              'Entrando…',
              'Se você já jogou em outro aparelho, seus recordes daqui vão para a mesma conta.',
            );
            void pending.then((r) => {
              busy = false;
              if (r.type === 'signed-in')
                render(
                  r.moved
                    ? `Pronto! ${r.moved} partida(s) deste aparelho foram para a sua conta.`
                    : 'Pronto! Você está no ranking global.',
                );
              else render(r.type === 'error' ? r.message : undefined);
            });
          },
        ),
      );
      (signIn.list[1] as Phaser.GameObjects.Text).setColor('#1f2937');
      if (!ready && !connecting) {
        connecting = true;
        void account.prepare().then((ok) => {
          if (signIn.active) render(ok ? note : 'Sem conexão com o ranking global agora.');
        });
      }
      add(
        pillButton(
          scene,
          cx - 140,
          cy + 236,
          250,
          80,
          '✎ Apelido',
          26,
          GLASS_PILL,
          false,
          changeName,
        ),
      );
      add(
        pillButton(scene, cx + 140, cy + 236, 250, 80, 'Agora não', 26, GLASS_PILL, false, close),
      );
    };
    render();
  });
}
