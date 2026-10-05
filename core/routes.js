import { parseSpeakerAndForm, normalizeSpeakerName } from './voice-library.js';

const engines = ['fish', 'mini', 'eleven', 'mimo'];

export function normalizeRoute(value) {
  const route = structuredClone(value);
  route.bindings = Object.fromEntries(engines.filter(e => value.bindings?.[e]).map(e => [e, { voice: String(value.bindings[e].voice || ''), model: String(value.bindings[e].model || '') }]));
  if (engines.includes(route.engine)) {
    route.voice = String(route.voice ?? route.bindings[route.engine]?.voice ?? '');
    route.model = String(route.model ?? route.bindings[route.engine]?.model ?? '');
    route.bindings[route.engine] = { voice: route.voice, model: route.model };
  }
  route.forms = {};
  if (value.forms && typeof value.forms === 'object' && !Array.isArray(value.forms)) {
    for (const [rawFormName, fData] of Object.entries(value.forms)) {
      const fName = String(rawFormName || '').trim();
      if (!fName || typeof fData !== 'object' || !fData) continue;
      route.forms[fName] = {
        voice: String(fData.voice || ''),
        model: String(fData.model || '')
      };
    }
  }
  return route;
}

export function resolveVoiceRoute(routes, rawSpeaker, defaultVoice = '') {
  const raw = String(rawSpeaker || '').trim();
  if (!raw) return null;
  const { baseSpeaker, form } = parseSpeakerAndForm(raw);
  const canonRaw = normalizeSpeakerName(raw);
  const canonBase = normalizeSpeakerName(baseSpeaker);
  let route = routes.find(r => normalizeSpeakerName(r.name) === canonRaw) || (canonBase ? routes.find(r => normalizeSpeakerName(r.name) === canonBase) : null);
  if (route) {
    const effective = structuredClone(route);
    if (form && effective.forms && typeof effective.forms === 'object') {
      const formKey = Object.keys(effective.forms).find(k => normalizeSpeakerName(k) === normalizeSpeakerName(form));
      if (formKey && effective.forms[formKey]?.voice?.trim()) {
        effective.voice = effective.forms[formKey].voice.trim();
        if (effective.forms[formKey].model?.trim()) effective.model = effective.forms[formKey].model.trim();
        return { route: effective, matched: 'form', form: formKey };
      }
    }
    return { route: effective, matched: route.name === raw ? 'exact' : 'base' };
  }
  if (defaultVoice && defaultVoice.trim()) {
    return { route: { id: 'default-voice', name: raw, engine: 'fish', voice: defaultVoice.trim(), model: '' }, matched: 'default' };
  }
  return null;
}

export function switchRouteEngine(value, engine) {
  if (!engines.includes(engine)) throw Error('引擎无效');
  const route = normalizeRoute(value);
  if (engine === route.engine) return route;
  route.engine = engine;
  route.voice = route.bindings[engine]?.voice || '';
  route.model = route.bindings[engine]?.model || '';
  return route;
}

export function removeRoute(settings, id) {
  const next = structuredClone(settings), index = next.routes.findIndex(r => r.id === id);
  if (index < 0) return next;
  next.routes.splice(index, 1);
  if (next.selected === id) next.selected = next.routes[Math.min(index, next.routes.length - 1)]?.id || '';
  return next;
}
