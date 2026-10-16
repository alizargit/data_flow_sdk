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
// THE WORDS ARE THE APP'S TO CHOOSE. English and Portuguese are built in
// (`lang`), and any string can be replaced (`text`), keyed as in TEXT below. A
// message is chosen by the connection's `code` and falls back to its English
// `message`, so a code the widget has no words for still says something true.
// "Data Flow" itself is a name and is never translated.
//
// Shadow DOM, so the host page's CSS cannot restyle it and its CSS cannot leak.

const ICON = new URL('../assets/dataflow-icon-96.png', import.meta.url).href;

/**
 * Every string the widget shows. A value is text, or a function of the app's
 * palette label. Replace any of them with the element's `text` property, or
 * conn.mount(el, { text }).
 */
export const TEXT = {
  en: {
    checking: 'Checking your Data Flow…',
    signin: 'Sign in to Puter to connect.',
    off: label => `Send your ${label} data to your own Data Flow.`,
    declined: 'The connection was declined in Data Flow.',
    pending: 'Approve the connection in the Data Flow window…',
    open_link: 'Approve the connection in Data Flow:',
    link: 'Open Data Flow',
    on: label => `Connected — ${label} appears under Inputs in your Data Flow.`,
    outdated: label => `${label} changed what it sends. Switch on to review it in Data Flow.`,
    timeout: 'The connection was not approved in time. Switch on to try again.',
    closed: 'Data Flow was closed before the connection was approved.',
    unsupported: 'This Data Flow cannot accept app connections yet.',
    not_puter: 'Data Flow connections work only in apps that run on Puter.',
    no_puterjs: 'Load puter.js before the Data Flow SDK.',
    network: 'Data Flow could not be reached. Check your connection and try again.',
    queue_full: 'Your Data Flow has too much waiting. Open Data Flow, then try again.',
    error: 'Something went wrong. Try again.',
    aria_connect: 'Connect to Data Flow',
    aria_disconnect: 'Disconnect from Data Flow',
    aria_cancel: 'Stop waiting for Data Flow',
  },
  pt: {
    checking: 'A verificar o seu Data Flow…',
    signin: 'Inicie sessão no Puter para ligar.',
    off: label => `Envie os seus dados de ${label} para o seu próprio Data Flow.`,
    declined: 'A ligação foi recusada no Data Flow.',
    pending: 'Aprove a ligação na janela do Data Flow…',
    open_link: 'Aprove a ligação no Data Flow:',
    link: 'Abrir o Data Flow',
    on: label => `Ligado — ${label} aparece em Inputs no seu Data Flow.`,
    outdated: label => `${label} mudou o que envia. Ative para o rever no Data Flow.`,
    timeout: 'A ligação não foi aprovada a tempo. Ative para tentar de novo.',
    closed: 'O Data Flow foi fechado antes de a ligação ser aprovada.',
    unsupported: 'Este Data Flow ainda não aceita ligações de apps.',
    not_puter: 'As ligações ao Data Flow só funcionam em apps que correm no Puter.',
    no_puterjs: 'Carregue o puter.js antes do SDK do Data Flow.',
    network: 'Não foi possível contactar o Data Flow. Verifique a ligação e tente de novo.',
    queue_full: 'O seu Data Flow tem demasiado à espera. Abra o Data Flow e tente de novo.',
    error: 'Algo correu mal. Tente de novo.',
    aria_connect: 'Ligar ao Data Flow',
    aria_disconnect: 'Desligar do Data Flow',
    aria_cancel: 'Deixar de esperar pelo Data Flow',
  },
};

/** 'pt', 'pt-PT', 'pt-BR' → 'pt'; anything without built-in words → 'en'. */
const langOf = v => {
  const base = String(v || '').toLowerCase().split('-')[0];
  return Object.hasOwn(TEXT, base) ? base : 'en';
};

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
.sub a { color: var(--df-accent); font-weight: 600; margin-left: 4px; text-underline-offset: 2px; }
.sub a:focus-visible { outline: 2px solid var(--df-accent); outline-offset: 2px; border-radius: 2px; }
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

// States whose words come from the state itself; the rest come from the code.
const WARN = new Set(['outdated', 'unavailable', 'error']);

export class DataFlowConnectElement extends HTMLElement {
  static get observedAttributes() { return ['lang']; }

  #conn = null;
  #text = {};
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
        <button class="switch" type="button" role="switch" aria-checked="false" disabled></button>
      </div>`;
    // The handler must call toggle() synchronously: connecting opens a window,
    // which a browser allows only inside the click itself.
    this.#root.querySelector('.switch').addEventListener('click', () => this.#conn && this.#conn.toggle());
  }

  attributeChangedCallback() { this.#render(); }

  // Without a `lang` of its own, the widget speaks the page's language — and an
  // app that switches it (an EN/PT toggle setting <html lang>) switches the
  // widget with it.
  #htmlLang = new MutationObserver(() => { if (!this.hasAttribute('lang')) this.#render(); });
  connectedCallback() { this.#htmlLang.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] }); this.#render(); }
  disconnectedCallback() { this.#htmlLang.disconnect(); }

  /** The Connection this widget shows and drives (from DataFlow.define()). */
  get connection() { return this.#conn; }
  set connection(conn) {
    if (this.#conn) this.#conn.removeEventListener('change', this.#onChange);
    this.#conn = conn || null;
    if (this.#conn) this.#conn.addEventListener('change', this.#onChange);
    this.#render();
  }

  /** Replacement strings, keyed as in TEXT; merged over the language's own. */
  get text() { return { ...this.#text }; }
  set text(v) { this.#text = v && typeof v === 'object' ? { ...v } : {}; this.#render(); }

  /** The words in use: the `lang` attribute, else the page's <html lang>, else English. */
  #words() {
    return { ...TEXT[langOf(this.getAttribute('lang') || document.documentElement.lang)], ...this.#text };
  }

  #say(key, fallback = '') {
    const w = this.#words()[key];
    if (typeof w === 'function') return w(this.#conn.manifest.palette.label);
    return typeof w === 'string' ? w : fallback;
  }

  #subtitle() {
    const c = this.#conn;
    if (c.state === 'off') return [c.code === 'declined' || c.code === 'timeout' || c.code === 'closed' ? this.#say(c.code, c.message) : this.#say('off'), !!c.code];
    if (c.state === 'pending') return [c.code === 'open_link' ? this.#say('open_link', c.message) : this.#say('pending'), false];
    if (c.state === 'unavailable' || c.state === 'error') {
      return [this.#say(c.code, c.message || this.#say('error')), true];
    }
    return [this.#say(c.state), WARN.has(c.state)];
  }

  #render() {
    const sw = this.#root.querySelector('.switch');
    const sub = this.#root.querySelector('.sub');
    const c = this.#conn;
    if (!c) { sub.textContent = ''; sw.disabled = true; return; }
    const [text, warn] = this.#subtitle();
    // Built from nodes, not markup: the label and messages are the app's text.
    sub.textContent = text || '';
    if (c.state === 'pending' && c.consentUrl) {
      const a = document.createElement('a');
      a.href = c.consentUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = this.#say('link');
      sub.append(' ', a);
    }
    sub.classList.toggle('warn', !!warn);
    sw.setAttribute('aria-checked', String(c.state === 'on'));
    sw.classList.toggle('pending', c.state === 'pending');
    sw.disabled = c.state === 'checking' || c.state === 'unavailable';
    sw.setAttribute('aria-label', this.#say(c.state === 'on' ? 'aria_disconnect' : c.state === 'pending' ? 'aria_cancel' : 'aria_connect'));
  }
}
