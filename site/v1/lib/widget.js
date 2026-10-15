// ===== widget.js — <dataflow-connect>, the switch an app puts on its page =====
//
//   [ Data Flow icon ]  Data Flow                         ( switch )
//                       Send your Carisma data to …
//
// One panel in Data Flow's own navy (--brand, #2e4057 in Data Flow's
// styles.css), its icon on the left, a switch on the right. The switch is a
// copy of Data Flow's own (.fin-report-switch: 36×20, a 16px thumb), coloured
// with Data Flow's accent orange — the colour its input palettes wear — when on.
//
// The look is fixed on purpose: every app that carries this widget shows the
// same object, so a user recognises it as Data Flow's and not the app's own
// control. Size is the only thing a host page controls (the element's width).
//
// Shadow DOM, so the host page's CSS cannot restyle it and its CSS cannot leak.

const ICON = new URL('../assets/dataflow-icon-96.png', import.meta.url).href;

const CSS = `
:host { display: block; max-width: 440px; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
:host([hidden]) { display: none; }
.panel {
  --df-brand: #2e4057; --df-brand-hover: #243447; --df-accent: #f29e4c;
  --df-ink: #ffffff; --df-ink-dim: rgba(255, 255, 255, .74); --df-track: rgba(255, 255, 255, .24);
  display: flex; align-items: center; gap: 12px;
  min-height: 64px; box-sizing: border-box; padding: 10px 14px 10px 10px;
  background: var(--df-brand); color: var(--df-ink);
  border-radius: 10px; box-shadow: 0 1px 2px rgba(29, 37, 48, .18);
}
.icon { width: 44px; height: 44px; flex-shrink: 0; border-radius: 10px; display: block; }
.text { flex: 1; min-width: 0; }
.title { font-size: 14px; font-weight: 650; line-height: 1.25; letter-spacing: .1px; }
.sub {
  margin-top: 2px; font-size: 12px; line-height: 1.4; color: var(--df-ink-dim);
  overflow-wrap: anywhere;
}
.sub.warn { color: #ffd8ad; }
button.switch {
  position: relative; flex-shrink: 0; width: 36px; height: 20px; padding: 0; margin: 0;
  border: 0; border-radius: 999px; background: var(--df-track); cursor: pointer;
  transition: background .15s; -webkit-tap-highlight-color: transparent;
}
button.switch::after {
  content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;
  background: #ffffff; box-shadow: 0 1px 2px rgba(0, 0, 0, .25); transition: transform .15s;
}
button.switch[aria-checked="true"] { background: var(--df-accent); }
button.switch[aria-checked="true"]::after { transform: translateX(16px); }
button.switch:focus-visible { outline: 2px solid var(--df-accent); outline-offset: 2px; }
button.switch:disabled { cursor: default; opacity: .45; }
/* Waiting for approval: on its way, not there yet. */
button.switch.pending { background: rgba(242, 158, 76, .55); }
button.switch.pending::after { transform: translateX(8px); animation: df-pulse 1.1s ease-in-out infinite; }
@keyframes df-pulse { 50% { opacity: .55; } }
@media (prefers-reduced-motion: reduce) {
  button.switch, button.switch::after { transition: none; }
  button.switch.pending::after { animation: none; }
}
`;

function subtitle(conn) {
  const label = conn.manifest.palette.label;
  switch (conn.state) {
    case 'checking':    return ['Checking your Data Flow…'];
    case 'signin':      return ['Sign in to Puter to connect.'];
    case 'off':         return [conn.message || `Send your ${label} data to your own Data Flow.`, !!conn.message];
    case 'pending':     return ['Approve the connection in the Data Flow window…'];
    case 'on':          return [`Connected — ${label} appears under Inputs in your Data Flow.`];
    case 'outdated':    return [`${label} changed what it sends. Switch on to review it in Data Flow.`, true];
    case 'unavailable': return [conn.message, true];
    case 'error':       return [conn.message, true];
  }
  return [''];
}

export class DataFlowConnectElement extends HTMLElement {
  #conn = null;
  #onChange = () => this.#render();
  #root;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    this.#root.innerHTML = `<style>${CSS}</style>
      <div class="panel" part="panel">
        <img class="icon" src="${ICON}" alt="" width="44" height="44">
        <div class="text">
          <div class="title">Data Flow</div>
          <div class="sub" aria-live="polite"></div>
        </div>
        <button class="switch" type="button" role="switch" aria-checked="false" aria-label="Connect to Data Flow" disabled></button>
      </div>`;
    // The handler must call toggle() synchronously: connecting opens a window,
    // which a browser allows only inside the click itself.
    this.#root.querySelector('.switch').addEventListener('click', () => this.#conn && this.#conn.toggle());
  }

  /** The Connection this widget shows and drives (from DataFlow.define()). */
  get connection() { return this.#conn; }
  set connection(conn) {
    if (this.#conn) this.#conn.removeEventListener('change', this.#onChange);
    this.#conn = conn || null;
    if (this.#conn) this.#conn.addEventListener('change', this.#onChange);
    this.#render();
  }

  #render() {
    const sw = this.#root.querySelector('.switch');
    const sub = this.#root.querySelector('.sub');
    const c = this.#conn;
    if (!c) {
      sub.textContent = '';
      sw.disabled = true;
      return;
    }
    const [text, warn] = subtitle(c);
    sub.textContent = text || '';
    sub.classList.toggle('warn', !!warn);
    sw.setAttribute('aria-checked', String(c.state === 'on'));
    sw.classList.toggle('pending', c.state === 'pending');
    sw.disabled = c.state === 'checking' || c.state === 'unavailable';
    sw.setAttribute('aria-label', c.state === 'on'
      ? 'Disconnect from Data Flow' : c.state === 'pending' ? 'Stop waiting for Data Flow' : 'Connect to Data Flow');
  }
}
