// Press Enter in the Gemma chat input field to send.
console.log('[gemma_enter] module loaded v3');

(() => {
  const PATH_MATCH = 'gemma';
  const SCRIPT_DOMAIN = 'script';
  const SCRIPT_SERVICE = 'chat_with_gemma';

  const getHass = () => {
    const ha = document.querySelector('home-assistant');
    return ha && ha.hass;
  };

  const fire = async () => {
    console.log('[gemma_enter] firing script.chat_with_gemma');
    const hass = getHass();
    if (!hass) { console.warn('[gemma_enter] no hass'); return; }
    try {
      await hass.callService(SCRIPT_DOMAIN, SCRIPT_SERVICE, {});
      console.log('[gemma_enter] sent');
    } catch (err) {
      console.warn('[gemma_enter] callService failed', err);
    }
  };

  const handler = (e) => {
    if (e.key !== 'Enter') return;
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
    if (!location.pathname.includes(PATH_MATCH)) return;
    const path = e.composedPath();
    const tags = path.map(el => el && el.tagName).filter(Boolean);
    console.log('[gemma_enter] Enter on', e.type, 'path tags:', tags.slice(0,8).join(' > '));
    const inTextfield = tags.includes('HA-TEXTFIELD') || tags.includes('INPUT') || tags.includes('MWC-TEXTFIELD');
    if (!inTextfield) return;
    if (tags.includes('TEXTAREA')) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    fire();
  };

  document.addEventListener('keydown', handler, true);
  window.addEventListener('keydown', handler, true);
  console.log('[gemma_enter] listeners attached');
})();
