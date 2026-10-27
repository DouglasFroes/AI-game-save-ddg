/** The chat's stylesheet (injected once). Same palette and font as the hub. */
export const CHAT_CSS = /* css */ `
.fxc {
  --bg: #06070f;
  --panel: #0b0d1e;
  --glass: rgba(255,255,255,.06);
  --glass-2: rgba(255,255,255,.1);
  --line: rgba(255,255,255,.1);
  --text: #f5f7ff;
  --soft: #b6bcdc;
  --mute: #7a80a8;
  --cyan: #38e1ff;
  --violet: #8b5cf6;
  --pink: #ff5fb8;
  --gold: #ffd166;
  --green: #34d399;
  --danger: #ff6b8b;
  --spring: cubic-bezier(.2,.9,.25,1.12);
  --ease: cubic-bezier(.22,.8,.3,1);
  --vvh: 100dvh;
  --vvtop: 0px;
  position: fixed; inset: 0; z-index: 9000;
  font-family: "Sora", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--text);
  -webkit-tap-highlight-color: transparent;
  -webkit-font-smoothing: antialiased;
}
.fxc * { box-sizing: border-box; }
:where(.fxc) button { font: inherit; color: inherit; border: 0; background: none; cursor: pointer; padding: 0; }
:where(.fxc) button:focus-visible { outline: 2px solid var(--cyan); outline-offset: 2px; }
.fxc textarea:focus, .fxc textarea:focus-visible { outline: none; }

.fxc-scrim {
  position: absolute; inset: 0;
  background: radial-gradient(120% 80% at 50% 100%, rgba(139,92,246,.25), rgba(3,4,10,.78) 60%);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  opacity: 0; transition: opacity .32s var(--ease);
}
.fxc.is-open .fxc-scrim { opacity: 1; }

.fxc-panel {
  position: absolute; left: 50%; top: var(--vvtop);
  width: min(100vw, 560px); height: var(--vvh);
  transform: translate(-50%, 104%);
  display: flex; flex-direction: column;
  background:
    radial-gradient(90% 40% at 0% 0%, rgba(56,225,255,.12), transparent 60%),
    radial-gradient(80% 40% at 100% 10%, rgba(255,95,184,.12), transparent 60%),
    radial-gradient(120% 60% at 50% 120%, rgba(139,92,246,.22), transparent 60%),
    linear-gradient(180deg, #0d1024, #070815);
  border: 1px solid var(--line);
  box-shadow: 0 -20px 80px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.08);
  overflow: hidden;
  transition: transform .46s var(--spring);
  will-change: transform;
}
.fxc.is-open .fxc-panel { transform: translate(-50%, 0); }
@media (min-width: 900px) {
  .fxc-panel {
    left: auto; right: 24px; top: calc(var(--vvtop) + 24px);
    width: 440px; height: calc(var(--vvh) - 48px);
    border-radius: 32px; transform: translate(0, 0) scale(.92); opacity: 0;
    transition: transform .42s var(--spring), opacity .3s var(--ease);
  }
  .fxc.is-open .fxc-panel { transform: none; opacity: 1; }
}
@media (max-width: 899px) and (min-height: 500px) {
  .fxc-panel { border-radius: 0; border-left: 0; border-right: 0; }
}

/* ── Header ─────────────────────────────────────────────────────────────── */
.fxc-head {
  flex: none; position: relative; z-index: 3;
  padding: calc(env(safe-area-inset-top) + 12px) 16px 10px;
  background: linear-gradient(180deg, rgba(13,16,36,.96), rgba(13,16,36,.82));
  backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
  border-bottom: 1px solid var(--line);
}
.fxc-titlebar { display: flex; align-items: center; gap: 12px; }
.fxc-logo {
  width: 46px; height: 46px; border-radius: 16px; flex: none;
  display: grid; place-items: center; font-size: 24px;
  background: linear-gradient(135deg, var(--cyan), var(--violet) 55%, var(--pink));
  box-shadow: 0 8px 24px rgba(139,92,246,.45), inset 0 1px 0 rgba(255,255,255,.4);
  animation: fxc-float 4s ease-in-out infinite;
}
.fxc-logo svg { width: 24px; height: 24px; }
.fxc-titles { flex: 1; min-width: 0; }
.fxc-titles h2 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: .2px; line-height: 1.15; }
.fxc-sub { margin: 2px 0 0; font-size: 12.5px; color: var(--soft); display: flex; align-items: center; gap: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fxc-live { width: 8px; height: 8px; border-radius: 50%; background: var(--green); box-shadow: 0 0 0 0 rgba(52,211,153,.6); animation: fxc-pulse 2s infinite; flex: none; }
.fxc-icon {
  width: 44px; height: 44px; border-radius: 15px; flex: none;
  display: grid; place-items: center;
  background: var(--glass); border: 1px solid var(--line);
  transition: transform .18s var(--spring), background .2s;
}
.fxc-icon:active { transform: scale(.9); }
.fxc-icon:hover { background: var(--glass-2); }
.fxc-icon svg { width: 20px; height: 20px; }

.fxc-rooms { display: flex; gap: 8px; margin: 6px -16px -6px; padding: 6px 16px 10px; overflow-x: auto; scrollbar-width: none; }
.fxc-rooms::-webkit-scrollbar, .fxc-online::-webkit-scrollbar { display: none; }
.fxc-room {
  flex: none; display: flex; align-items: center; gap: 7px;
  height: 36px; padding: 0 14px 0 10px; border-radius: 18px;
  background: var(--glass); border: 1px solid var(--line);
  font-size: 13.5px; font-weight: 700; color: var(--soft);
  transition: all .25s var(--ease); position: relative;
}
.fxc-room .e { font-size: 17px; }
.fxc-room.is-on {
  color: #fff; border-color: transparent;
  background: linear-gradient(135deg, rgba(56,225,255,.9), rgba(139,92,246,.95) 55%, rgba(255,95,184,.95));
  box-shadow: 0 6px 18px rgba(139,92,246,.4);
}
.fxc-room .badge {
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px;
  background: var(--pink); color: #fff; font-size: 11px; display: grid; place-items: center;
}

.fxc-online { display: flex; gap: 6px; margin: 10px -16px 0; padding: 0 16px; overflow-x: auto; scrollbar-width: none; min-height: 0; }
.fxc-online:empty { display: none; }
.fxc-person {
  flex: none; display: flex; align-items: center; gap: 8px;
  padding: 4px 10px 4px 4px; border-radius: 22px;
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.06);
  font-size: 12.5px; max-width: 220px;
  animation: fxc-pop .35s var(--spring) both;
}
.fxc-person .who { display: flex; flex-direction: column; line-height: 1.15; min-width: 0; }
.fxc-person .n { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fxc-person .g { color: var(--mute); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fxc-person .play {
  margin-left: 2px; height: 24px; padding: 0 9px; border-radius: 12px; font-size: 11px; font-weight: 800;
  background: linear-gradient(135deg, #f59e0b, #f97316); color: #fff; flex: none;
}

/* ── Avatars ────────────────────────────────────────────────────────────── */
.fxc-av {
  --c: #8b5cf6;
  width: 34px; height: 34px; border-radius: 50%; flex: none; position: relative;
  display: grid; place-items: center; font-weight: 800; font-size: 14px; color: #fff;
  background: radial-gradient(circle at 30% 25%, rgba(255,255,255,.45), transparent 45%), var(--c);
  box-shadow: 0 0 0 2px rgba(255,255,255,.12), 0 4px 12px rgba(0,0,0,.35);
  text-shadow: 0 1px 2px rgba(0,0,0,.35);
}
.fxc-av.on::after {
  content: ''; position: absolute; right: -1px; bottom: -1px; width: 10px; height: 10px; border-radius: 50%;
  background: var(--green); border: 2px solid #0b0d1e;
}
.fxc-av.sm { width: 28px; height: 28px; font-size: 12px; }

/* ── Messages ───────────────────────────────────────────────────────────── */
.fxc-list {
  flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
  padding: 14px 12px 10px; scroll-behavior: auto;
  -webkit-overflow-scrolling: touch;
  mask-image: linear-gradient(180deg, transparent 0, #000 18px, #000 calc(100% - 8px), transparent);
}
.fxc-more { display: grid; place-items: center; height: 36px; color: var(--mute); font-size: 12px; }
.fxc-spin { width: 18px; height: 18px; border-radius: 50%; border: 2px solid rgba(255,255,255,.15); border-top-color: var(--cyan); animation: fxc-rot .8s linear infinite; }
.fxc-start { text-align: center; padding: 26px 18px 14px; color: var(--mute); font-size: 13px; }
.fxc-start b { display: block; font-size: 17px; color: var(--text); margin: 8px 0 4px; }
.fxc-start .big { font-size: 40px; display: block; animation: fxc-float 3.5s ease-in-out infinite; }

.fxc-day { display: flex; justify-content: center; margin: 14px 0 8px; position: sticky; top: 0; z-index: 1; pointer-events: none; }
.fxc-day span {
  font-size: 11.5px; font-weight: 700; color: var(--soft); letter-spacing: .3px;
  padding: 5px 12px; border-radius: 12px;
  background: rgba(18,20,43,.96); border: 1px solid var(--line);
  box-shadow: 0 4px 14px rgba(0,0,0,.35);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
}

.fxc-row { display: flex; align-items: flex-end; gap: 8px; margin-top: 2px; padding-right: 36px; position: relative; }
.fxc-row.first { margin-top: 10px; }
.fxc-row.mine { flex-direction: row-reverse; padding-right: 0; padding-left: 44px; }
.fxc-row .slot { width: 34px; flex: none; }
.fxc-row.mine .slot { display: none; }
.fxc-row.in { animation: fxc-in .42s var(--spring) both; }
.fxc-row.mine.in { animation-name: fxc-in-mine; }
.fxc-col { display: flex; flex-direction: column; min-width: 0; max-width: 100%; align-items: flex-start; }
.fxc-row.mine .fxc-col { align-items: flex-end; }
.fxc-name { font-size: 12px; font-weight: 800; margin: 0 0 4px 12px; cursor: pointer; }

.fxc-bubble {
  position: relative; max-width: min(78vw, 360px);
  padding: 9px 13px 8px; border-radius: 20px;
  background: rgba(255,255,255,.075); border: 1px solid rgba(255,255,255,.08);
  font-size: 15px; line-height: 1.38; white-space: pre-wrap; overflow-wrap: anywhere;
  box-shadow: 0 2px 10px rgba(0,0,0,.18);
  transition: transform .2s var(--spring), filter .2s;
  user-select: text; -webkit-user-select: text; touch-action: pan-y;
}
.fxc-row:not(.first):not(.mine) .fxc-bubble { border-top-left-radius: 8px; }
.fxc-row:not(.last):not(.mine) .fxc-bubble { border-bottom-left-radius: 8px; }
.fxc-row.mine .fxc-bubble {
  background: linear-gradient(135deg, #6d4dff, #a33dff 55%, #ff4fae);
  border-color: rgba(255,255,255,.12);
  box-shadow: 0 6px 20px rgba(163,61,255,.28), inset 0 1px 0 rgba(255,255,255,.22);
}
.fxc-row.mine:not(.first) .fxc-bubble { border-top-right-radius: 8px; }
.fxc-row.mine:not(.last) .fxc-bubble { border-bottom-right-radius: 8px; }
.fxc-row.pending .fxc-bubble { filter: saturate(.6) brightness(.85); }
.fxc-row.mention .fxc-bubble {
  background: linear-gradient(135deg, rgba(255,209,102,.18), rgba(255,95,184,.12));
  border-color: rgba(255,209,102,.55);
  box-shadow: 0 0 0 1px rgba(255,209,102,.25), 0 0 24px rgba(255,209,102,.18);
}
.fxc-bubble.jumbo { background: none !important; border: 0 !important; box-shadow: none !important; font-size: 44px; line-height: 1.1; padding: 2px 4px; }
.fxc-bubble.deleted { font-style: italic; color: var(--mute); background: transparent; border-style: dashed; }
.fxc-row.mine .fxc-bubble.deleted { background: transparent; color: var(--soft); box-shadow: none; }
.fxc-bubble.pressed { transform: scale(.97); }
.fxc-mention { color: var(--cyan); font-weight: 800; }
.fxc-row.mine .fxc-mention { color: #fff3c4; }
.fxc-quote {
  display: block; margin: -1px -4px 6px; padding: 6px 10px; border-radius: 12px;
  background: rgba(0,0,0,.22); border-left: 3px solid var(--cyan);
  font-size: 12.5px; line-height: 1.3; color: var(--soft); cursor: pointer;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
}
.fxc-quote b { color: var(--text); display: block; font-size: 11.5px; }
.fxc-row.mine .fxc-quote { border-left-color: #fff3c4; color: rgba(255,255,255,.85); }
.fxc-meta { display: flex; align-items: center; gap: 5px; margin: 3px 8px 0; font-size: 10.5px; color: var(--mute); }
.fxc-meta svg { width: 14px; height: 14px; }
.fxc-meta .ok path { stroke-dasharray: 20; stroke-dashoffset: 20; animation: fxc-draw .4s .05s var(--ease) forwards; }
.fxc-row.flash .fxc-bubble { animation: fxc-flash 1.2s var(--ease); }

.fxc-reacts { display: flex; flex-wrap: wrap; gap: 4px; margin-top: -6px; position: relative; z-index: 1; padding: 0 6px; }
.fxc-react {
  display: flex; align-items: center; gap: 3px; height: 26px; padding: 0 8px; border-radius: 13px;
  background: rgba(18,20,43,.95); border: 1px solid var(--line); font-size: 13px; font-weight: 700;
  box-shadow: 0 2px 8px rgba(0,0,0,.35);
  animation: fxc-pop .35s var(--spring) both;
}
.fxc-react.mine { border-color: rgba(56,225,255,.7); background: rgba(56,225,255,.16); }
.fxc-react .c { font-size: 11.5px; color: var(--soft); }

.fxc-actions {
  position: absolute; top: 50%; transform: translateY(-50%) scale(.8); opacity: 0; pointer-events: none;
  display: flex; gap: 2px; padding: 3px; border-radius: 14px;
  background: rgba(18,20,43,.95); border: 1px solid var(--line);
  transition: all .18s var(--ease); right: 0;
}
.fxc-row.mine .fxc-actions { right: auto; left: 0; }
@media (hover: hover) {
  .fxc-row:hover .fxc-actions { opacity: 1; transform: translateY(-50%) scale(1); pointer-events: auto; }
}
.fxc-actions button { width: 28px; height: 28px; border-radius: 10px; display: grid; place-items: center; font-size: 15px; }
.fxc-actions button:hover { background: var(--glass-2); }
.fxc-swipe {
  position: absolute; left: 6px; top: 50%; width: 30px; height: 30px; margin-top: -15px; border-radius: 50%;
  display: grid; place-items: center; background: var(--glass-2); opacity: 0; transform: scale(.4);
  transition: opacity .15s, transform .15s; pointer-events: none;
}

.fxc-typing { display: flex; align-items: center; gap: 8px; height: 0; overflow: hidden; opacity: 0; transition: all .3s var(--ease); padding-left: 4px; }
.fxc-typing.is-on { height: 40px; opacity: 1; margin-top: 8px; }
.fxc-dots { display: flex; gap: 4px; padding: 11px 13px; border-radius: 18px; background: rgba(255,255,255,.075); }
.fxc-dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--soft); animation: fxc-bounce 1.2s infinite; }
.fxc-dots i:nth-child(2) { animation-delay: .15s; }
.fxc-dots i:nth-child(3) { animation-delay: .3s; }
.fxc-typing .t { font-size: 12px; color: var(--mute); }

.fxc-jump {
  position: absolute; left: 50%; bottom: calc(var(--composer-h, 90px) + 12px); z-index: 4;
  transform: translate(-50%, 20px) scale(.8); opacity: 0; pointer-events: none;
  height: 38px; padding: 0 16px 0 12px; border-radius: 19px; display: flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 800; color: #fff;
  background: linear-gradient(135deg, var(--cyan), var(--violet));
  box-shadow: 0 10px 30px rgba(56,225,255,.35);
  transition: all .32s var(--spring);
}
.fxc-jump.is-on { transform: translate(-50%, 0) scale(1); opacity: 1; pointer-events: auto; }
.fxc-jump svg { width: 16px; height: 16px; }

/* ── Composer ───────────────────────────────────────────────────────────── */
.fxc-composer {
  flex: none; position: relative; z-index: 3;
  padding: 8px 12px calc(env(safe-area-inset-bottom) + 10px);
  background: linear-gradient(180deg, rgba(11,13,30,.6), rgba(11,13,30,.98) 30%);
  backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
  border-top: 1px solid var(--line);
}
.fxc-reply {
  display: none; align-items: center; gap: 10px; margin: 0 2px 8px; padding: 8px 10px 8px 12px; border-radius: 14px;
  background: rgba(56,225,255,.08); border-left: 3px solid var(--cyan);
  animation: fxc-up .3s var(--spring);
}
.fxc-reply.is-on { display: flex; }
.fxc-reply .q { flex: 1; min-width: 0; font-size: 12.5px; color: var(--soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fxc-reply .q b { color: var(--cyan); display: block; font-size: 11.5px; }
.fxc-bar { display: flex; align-items: flex-end; gap: 8px; }
.fxc-field {
  flex: 1; display: flex; align-items: flex-end; min-height: 48px; border-radius: 24px;
  background: rgba(255,255,255,.06); border: 1px solid var(--line);
  transition: border-color .2s, box-shadow .2s, background .2s;
}
.fxc-field:focus-within { border-color: rgba(56,225,255,.6); background: rgba(255,255,255,.08); box-shadow: 0 0 0 4px rgba(56,225,255,.12); }
.fxc-field textarea {
  flex: 1; resize: none; border: 0; outline: 0; background: transparent; color: var(--text);
  font: 500 16px/1.35 inherit; font-family: inherit; padding: 13px 4px 12px 2px; max-height: 120px; min-height: 46px;
}
.fxc-field textarea::placeholder { color: var(--mute); }
.fxc-emoji-btn { width: 46px; height: 46px; display: grid; place-items: center; font-size: 22px; flex: none; border-radius: 50%; transition: transform .2s var(--spring); }
.fxc-emoji-btn:active { transform: scale(.85) rotate(-12deg); }
.fxc-emoji-btn.is-on { filter: drop-shadow(0 0 8px rgba(255,209,102,.8)); }
.fxc-send {
  width: 48px; height: 48px; border-radius: 50%; flex: none; display: grid; place-items: center; position: relative;
  background: linear-gradient(135deg, var(--cyan), var(--violet) 55%, var(--pink));
  box-shadow: 0 8px 22px rgba(139,92,246,.45), inset 0 1px 0 rgba(255,255,255,.35);
  transition: transform .22s var(--spring), opacity .2s, filter .2s;
}
.fxc-send svg { width: 22px; height: 22px; transition: transform .3s var(--spring); }
.fxc-send:disabled { filter: grayscale(.8) brightness(.7); box-shadow: none; cursor: default; }
.fxc-send:not(:disabled):active { transform: scale(.88); }
.fxc-send.fly svg { animation: fxc-fly .5s var(--ease); }
.fxc-send .ring { position: absolute; inset: -3px; transform: rotate(-90deg); pointer-events: none; }
.fxc-send .ring circle { fill: none; stroke: var(--gold); stroke-width: 3; stroke-linecap: round; transition: stroke-dashoffset .1s linear; }
.fxc-hint { display: flex; justify-content: space-between; min-height: 0; font-size: 11.5px; padding: 0 12px; color: var(--mute); }
.fxc-hint:not(:empty) { margin-top: 6px; }
.fxc-hint .err { color: var(--danger); font-weight: 700; animation: fxc-shake .4s; }
.fxc-hint .warn { color: var(--gold); }

.fxc-emoji {
  height: 0; overflow: hidden; transition: height .32s var(--spring);
}
.fxc-emoji.is-on { height: 252px; }
.fxc-etabs { display: flex; gap: 4px; padding: 10px 2px 6px; }
.fxc-etabs button { flex: 1; height: 34px; border-radius: 12px; font-size: 18px; opacity: .55; transition: all .2s; }
.fxc-etabs button.is-on { opacity: 1; background: var(--glass-2); }
.fxc-egrid { height: 196px; overflow-y: auto; display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; padding: 2px; align-content: start; overscroll-behavior: contain; }
.fxc-egrid button { height: 42px; font-size: 26px; border-radius: 12px; transition: transform .15s var(--spring), background .15s; }
.fxc-egrid button:hover { background: var(--glass); }
.fxc-egrid button:active { transform: scale(1.35); }
.fxc-egrid .empty { grid-column: 1 / -1; text-align: center; color: var(--mute); font-size: 13px; padding: 30px 0; }

/* ── Context menu ───────────────────────────────────────────────────────── */
.fxc-menu { position: absolute; inset: 0; z-index: 20; display: none; }
.fxc-menu.is-on { display: block; }
.fxc-menu .bg { position: absolute; inset: 0; background: rgba(3,4,10,.55); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); animation: fxc-fade .2s; }
.fxc-sheet {
  position: absolute; left: 50%; width: min(92vw, 340px); transform: translateX(-50%);
  animation: fxc-zoom .3s var(--spring);
}
.fxc-reactbar {
  display: flex; justify-content: space-between; padding: 6px; border-radius: 26px; margin-bottom: 10px;
  background: rgba(22,25,52,.98); border: 1px solid var(--line); box-shadow: 0 16px 40px rgba(0,0,0,.5);
}
.fxc-reactbar button { width: 44px; height: 44px; border-radius: 50%; font-size: 26px; transition: transform .2s var(--spring), background .2s; animation: fxc-pop .4s var(--spring) both; }
.fxc-reactbar button:hover, .fxc-reactbar button.is-on { background: rgba(56,225,255,.18); transform: scale(1.15); }
.fxc-preview { padding: 10px 14px; margin-bottom: 10px; border-radius: 18px; background: rgba(255,255,255,.08); font-size: 14px; max-height: 120px; overflow: hidden; white-space: pre-wrap; overflow-wrap: anywhere; }
.fxc-opts { border-radius: 20px; overflow: hidden; background: rgba(22,25,52,.98); border: 1px solid var(--line); box-shadow: 0 16px 40px rgba(0,0,0,.5); }
.fxc-opts button { display: flex; align-items: center; gap: 12px; width: 100%; padding: 14px 16px; font-size: 15px; font-weight: 600; text-align: left; }
.fxc-opts button + button { border-top: 1px solid var(--line); }
.fxc-opts button:hover { background: var(--glass); }
.fxc-opts button.danger { color: var(--danger); }
.fxc-opts .i { width: 22px; text-align: center; font-size: 17px; }

.fxc-burst { position: absolute; pointer-events: none; font-size: 22px; z-index: 30; animation: fxc-burst .9s var(--ease) forwards; }

.fxc-toast {
  position: absolute; left: 50%; top: calc(env(safe-area-inset-top) + 14px); z-index: 40;
  transform: translate(-50%, -30px); opacity: 0;
  padding: 10px 16px; border-radius: 16px; font-size: 13.5px; font-weight: 700;
  background: rgba(22,25,52,.98); border: 1px solid var(--line); box-shadow: 0 12px 30px rgba(0,0,0,.45);
  transition: all .35s var(--spring); display: flex; gap: 10px; align-items: center; max-width: 92%;
}
.fxc-toast.is-on { transform: translate(-50%, 0); opacity: 1; }
.fxc-toast button { color: var(--cyan); font-weight: 800; }

.fxc-banner { margin: 10px 12px 0; padding: 10px 12px; border-radius: 14px; font-size: 12.5px; background: rgba(255,107,139,.12); border: 1px solid rgba(255,107,139,.4); color: #ffd0da; display: none; }
.fxc-banner.is-on { display: block; animation: fxc-up .3s var(--spring); }

/* ── Guest gate ─────────────────────────────────────────────────────────── */
.fxc-gate { position: absolute; inset: 0; z-index: 10; display: none; flex-direction: column; }
.fxc-gate.is-on { display: flex; }
.fxc-ghost { flex: 1; padding: 120px 16px 0; display: flex; flex-direction: column; gap: 12px; filter: blur(5px); opacity: .55; overflow: hidden; }
.fxc-ghost div { height: 44px; border-radius: 20px; background: rgba(255,255,255,.09); animation: fxc-ghost 3.2s ease-in-out infinite; }
.fxc-ghost div:nth-child(odd) { width: 62%; }
.fxc-ghost div:nth-child(even) { width: 48%; align-self: flex-end; background: linear-gradient(135deg, #6d4dff, #ff4fae); }
.fxc-ghost div:nth-child(3n) { width: 40%; animation-delay: .6s; }
.fxc-gatecard {
  position: absolute; left: 16px; right: 16px; bottom: calc(env(safe-area-inset-bottom) + 18px);
  padding: 26px 22px 20px; border-radius: 30px; text-align: center;
  background: linear-gradient(180deg, rgba(22,25,52,.94), rgba(12,14,34,.98));
  border: 1px solid rgba(255,255,255,.14);
  box-shadow: 0 30px 80px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.1);
  animation: fxc-up .5s var(--spring) both;
}
.fxc-lock {
  width: 76px; height: 76px; margin: -64px auto 12px; border-radius: 26px; display: grid; place-items: center; font-size: 36px;
  background: linear-gradient(135deg, var(--cyan), var(--violet) 55%, var(--pink));
  box-shadow: 0 14px 36px rgba(139,92,246,.55), inset 0 1px 0 rgba(255,255,255,.4);
  position: relative; overflow: hidden;
}
.fxc-lock::after { content: ''; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,.45) 50%, transparent 70%); transform: translateX(-120%); animation: fxc-shine 3s 1s infinite; }
.fxc-gatecard h3 { margin: 0 0 8px; font-size: 22px; font-weight: 800; }
.fxc-gatecard p { margin: 0 auto 18px; max-width: 340px; color: var(--soft); font-size: 14px; line-height: 1.5; }
.fxc-perks { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
.fxc-perks span { font-size: 12px; font-weight: 700; padding: 6px 10px; border-radius: 12px; background: var(--glass); border: 1px solid var(--line); color: var(--soft); }
.fxc-google {
  width: 100%; height: 56px; border-radius: 28px; display: flex; align-items: center; justify-content: center; gap: 12px;
  background: #fff; color: #1f2937 !important; font-size: 16.5px !important; font-weight: 800 !important;
  box-shadow: 0 10px 30px rgba(255,255,255,.18); transition: transform .2s var(--spring);
}
.fxc-google:active { transform: scale(.96); }
.fxc-google:disabled { opacity: .7; }
.fxc-google svg { width: 22px; height: 22px; }
.fxc-later { margin-top: 12px; height: 40px; font-size: 14px; color: var(--mute) !important; font-weight: 700; }
.fxc-gatemsg { min-height: 18px; margin-top: 8px; font-size: 12.5px; color: var(--danger); }

/* ── Keyframes ──────────────────────────────────────────────────────────── */
@keyframes fxc-in { from { opacity: 0; transform: translate(-14px, 10px) scale(.94); } to { opacity: 1; transform: none; } }
@keyframes fxc-in-mine { from { opacity: 0; transform: translate(14px, 14px) scale(.9); } to { opacity: 1; transform: none; } }
@keyframes fxc-pop { 0% { opacity: 0; transform: scale(.4); } 100% { opacity: 1; transform: scale(1); } }
@keyframes fxc-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@keyframes fxc-zoom { from { opacity: 0; transform: translateX(-50%) scale(.85); } to { opacity: 1; transform: translateX(-50%) scale(1); } }
@keyframes fxc-fade { from { opacity: 0; } }
@keyframes fxc-pulse { 0% { box-shadow: 0 0 0 0 rgba(52,211,153,.55); } 70% { box-shadow: 0 0 0 8px rgba(52,211,153,0); } 100% { box-shadow: 0 0 0 0 rgba(52,211,153,0); } }
@keyframes fxc-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
@keyframes fxc-rot { to { transform: rotate(360deg); } }
@keyframes fxc-bounce { 0%,60%,100% { transform: translateY(0); opacity: .5; } 30% { transform: translateY(-5px); opacity: 1; } }
@keyframes fxc-fly { 0% { transform: none; } 45% { transform: translate(18px,-18px) scale(.6); opacity: 0; } 46% { transform: translate(-14px,14px) scale(.6); opacity: 0; } 100% { transform: none; opacity: 1; } }
@keyframes fxc-draw { to { stroke-dashoffset: 0; } }
@keyframes fxc-shake { 0%,100% { transform: none; } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
@keyframes fxc-burst { 0% { opacity: 0; transform: translate(0,0) scale(.4); } 20% { opacity: 1; transform: translate(var(--dx), -20px) scale(1.2); } 100% { opacity: 0; transform: translate(calc(var(--dx) * 2), -110px) scale(.9) rotate(var(--rot)); } }
@keyframes fxc-flash { 0%,100% { box-shadow: none; } 30% { box-shadow: 0 0 0 3px rgba(56,225,255,.7), 0 0 30px rgba(56,225,255,.5); } }
@keyframes fxc-ghost { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes fxc-shine { 0% { transform: translateX(-120%); } 40%,100% { transform: translateX(120%); } }

@media (prefers-reduced-motion: reduce) {
  .fxc *, .fxc *::before, .fxc *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; }
}
`;

let injected = false;

export function injectChatStyles(): void {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const el = document.createElement('style');
  el.id = 'fxc-styles';
  el.textContent = CHAT_CSS;
  document.head.appendChild(el);
}
