export const VOICE_CATEGORY_KEYS = Object.freeze(['zh', 'ja', 'en']);
export const VOICE_CATEGORY_LABELS = Object.freeze({ zh: '中文', ja: '日语', en: '英语' });
export const VOICE_CATEGORY_BY_LABEL = Object.freeze({ 中文: 'zh', 日语: 'ja', 英语: 'en' });

const AUTO_CJK_RUN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u30FF\u31F0-\u31FF\uAC00-\uD7AF\uFF66-\uFF9F]+/g;
const AUTO_WORD_RUN = /[A-Za-z0-9_]{2,}/g;
const AUTO_STOPWORDS = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'you', 'your', 'her', 'his', 'she', 'he', 'not', 'are', 'was', 'has', 'had', 'but', 'who', 'what', 'when', 'where', 'from', 'into', 'over', 'very']);

export function normalizeSpeakerName(raw) {
  return String(raw || '').normalize('NFKC').replace(/[\u00A0\u200B-\u200F\uFEFF]/g, ' ').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

/** Parses "角色名(幼年)" or "角色名#黑化" into baseSpeaker and form */
export function parseSpeakerAndForm(rawSpeaker) {
  const s = String(rawSpeaker || '').trim();
  const m = s.match(/^([^\(\)（）_#]+?)(?:\s*[\(_（#]([^\(\)（）_#]+)[\)）]?)?$/);
  if (!m) return { baseSpeaker: s, form: '' };
  return { baseSpeaker: (m[1] || '').trim(), form: (m[2] || '').trim() };
}

export function normalizeLibraryEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const id = String(entry.id || '').trim();
  const name = String(entry.name || '').trim();
  const category = VOICE_CATEGORY_KEYS.includes(entry.category) ? entry.category : (VOICE_CATEGORY_BY_LABEL[entry.category] || 'zh');
  const sub = String(entry.sub || '').trim();
  const desc = String(entry.desc || '').trim();
  return id && name ? { id, name, category, sub, desc } : null;
}

export function sortVoiceLibrary(list) {
  return [...list].sort((a, b) => (VOICE_CATEGORY_KEYS.indexOf(a.category) - VOICE_CATEGORY_KEYS.indexOf(b.category))
    || a.sub.localeCompare(b.sub, 'zh') || a.name.localeCompare(b.name, 'zh') || a.id.localeCompare(b.id));
}

export function parseVoiceLibraryText(text) {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  let category = '', sub = '';
  const entries = [], invalid = [];
  for (const line of lines) {
    const heading = /^(中文|日语|英语)(?:\s*[\/／]\s*(.*))?$/.exec(line);
    if (heading) {
      category = VOICE_CATEGORY_BY_LABEL[heading[1]];
      sub = (heading[2] || '').trim();
      continue;
    }
    const match = /^(\S+)\s+(.+)$/.exec(line);
    const entry = category && match ? normalizeLibraryEntry({ id: match[1], name: match[2], category, sub }) : null;
    if (entry) entries.push(entry);
    else invalid.push(line);
  }
  return { entries, invalid };
}

export function mergeVoiceLibrary(currentList, incomingList) {
  const target = new Map((currentList || []).map(entry => [entry.id, entry]));
  let added = 0, overwritten = 0;
  for (const raw of incomingList || []) {
    const entry = normalizeLibraryEntry(raw);
    if (!entry) continue;
    if (target.has(entry.id)) overwritten++;
    else added++;
    target.set(entry.id, entry);
  }
  return { added, overwritten, list: sortVoiceLibrary([...target.values()]) };
}

export function autoTextTokens(text) {
  const tokens = new Set();
  const value = String(text || '').normalize('NFKC').toLocaleLowerCase();
  for (const m of value.matchAll(AUTO_CJK_RUN)) {
    const run = m[0];
    if (run.length < 2) { tokens.add(run); continue; }
    for (let i = 0; i <= run.length - 2; i++) tokens.add(run.slice(i, i + 2));
  }
  for (const m of value.matchAll(AUTO_WORD_RUN)) {
    const word = m[0];
    if (!AUTO_STOPWORDS.has(word)) tokens.add(word);
  }
  return tokens;
}

export function autoMatchScore(profile, entry, language = 'zh') {
  const roleText = `${profile?.text || ''} ${profile?.name || ''}`;
  const roleTokens = autoTextTokens(roleText);
  const entryText = [entry?.name, entry?.sub, entry?.desc, VOICE_CATEGORY_LABELS[entry?.category] || ''].filter(Boolean).join(' ');
  const entryTokens = autoTextTokens(entryText);
  let score = 0;
  for (const token of roleTokens) {
    if (!entryTokens.has(token)) continue;
    score += /^[A-Za-z0-9_]{4,}$/.test(token) ? 3 : 2;
  }
  const roleName = normalizeSpeakerName(profile?.name || '');
  const entryName = normalizeSpeakerName(entry?.name || '');
  if (roleName && entryName) {
    if (roleName === entryName) score += 10;
    else if (entryName.length >= 2 && (roleName.includes(entryName) || entryName.includes(roleName))) score += 5;
  }
  const form = String(profile?.form || '').trim();
  if (form.length >= 2) {
    for (const token of autoTextTokens(form)) {
      if (entryTokens.has(token) || entryText.includes(form)) { score += 3; break; }
    }
  }
  const desc = String(entry?.desc || '').trim();
  const sub = String(entry?.sub || '').trim();
  const name = String(entry?.name || '').trim();
  if (desc.length >= 2 && roleText.includes(desc)) score += 8;
  if (sub.length >= 2 && roleText.includes(sub)) score += 6;
  if (name.length >= 2 && roleText.includes(name)) score += 4;
  if (desc) {
    for (const m of desc.matchAll(AUTO_CJK_RUN)) {
      const run = m[0];
      if (run.length >= 2 && roleText.includes(run)) score += Math.min(4, run.length);
    }
  }
  if (entry?.category === language || VOICE_CATEGORY_LABELS[entry?.category] === language) score += 2;
  return score;
}

export function pickAutoVoice(profile, library, language = 'zh', minScore = 6) {
  let best = null;
  for (const entry of library || []) {
    if (!String(entry?.id || '').trim()) continue;
    const score = autoMatchScore(profile, entry, language);
    if (!best || score > best.score) best = { entry, score };
  }
  return best && best.score >= minScore ? best : null;
}
