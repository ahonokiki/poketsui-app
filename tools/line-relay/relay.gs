/**
 * 奥さまのLINE → Claude の中継（Google Apps Script）
 *
 * 流れ：LINE公式アカウントに届いたメッセージをためて、3分間つづきがなければ
 *       Claude のスケジュールタスク（API トリガー）に渡す。Claude が直したら、
 *       このスクリプトを通して LINE に返事が届く。
 *
 * スクリプト プロパティ（プロジェクトの設定 → スクリプト プロパティ）に入れるもの：
 *   LINE_TOKEN … LINE のチャネルアクセストークン（長期）
 *   FIRE_URL   … Claude のスケジュールタスクの Fire URL（…/fire）
 *   FIRE_TOKEN … そのタスクの API トークン（sk-ant-oat01-…）
 *   WEB_URL    … このスクリプトをウェブアプリとしてデプロイしたときの URL（…/exec）
 * setup() を一度実行すると、次のものは自動で入る：
 *   KEY      … Claude からの返事・画像の取り出し用の合言葉（自動）
 *   REG_CODE … 「登録 ○○○○」で使う4桁の番号（自動。実行ログに出る）
 *   ALLOW    … 登録した人の LINE のID（「登録 ○○○○」を送ると自動で入る）
 */
const P = PropertiesService.getScriptProperties();
const WAIT_MIN = 3;              // 最後のメッセージから何分待ってから Claude に渡すか
const MAX_QUEUE = 40;            // ためておくメッセージの上限
const CHAT_ONLY = /^(ありがと|ありがとう|ありがとー|あざ|了解|りょ|ok|おけ|おっけ|はーい|はい|うん|👍|🙏|😊|助かる|さすが|すごい|最高)[!！。〜ー♡❤️✨☺️😆🥰\s]*$/i;

function setup() {
  if (!P.getProperty('KEY')) P.setProperty('KEY', Utilities.getUuid().replace(/-/g, ''));
  if (!P.getProperty('REG_CODE')) P.setProperty('REG_CODE', String(1000 + Math.floor(Math.random() * 9000)));
  ['LINE_TOKEN', 'FIRE_URL', 'FIRE_TOKEN', 'WEB_URL'].forEach(k => { if (!P.getProperty(k)) Logger.log('⚠ まだ入っていません：' + k); });
  Logger.log('登録の番号：' + P.getProperty('REG_CODE') + '（LINEで「登録 ' + P.getProperty('REG_CODE') + '」と送ると、その人が使えるようになります）');
  Logger.log('準備OK。次は「デプロイ → 新しいデプロイ → ウェブアプリ」です。');
}

// ---- LINE からのメッセージ（Webhook） ----
function doPost(e) {
  let body; try { body = JSON.parse(e.postData.contents); } catch (_) { return ok_(); }
  const allow = (P.getProperty('ALLOW') || '').split(',').filter(Boolean);
  for (const ev of (body.events || [])) {
    const uid = ev.source && ev.source.userId; if (!uid || ev.type !== 'message') continue;
    const m = ev.message, text = m.type === 'text' ? m.text.trim() : '';
    // 登録：「登録 1234」
    const reg = text.replace(/\s/g, '').match(/^登録(\d{4})$/);
    if (reg) {
      if (reg[1] === P.getProperty('REG_CODE')) {
        if (!allow.includes(uid)) { allow.push(uid); P.setProperty('ALLOW', allow.join(',')); }
        reply_(ev.replyToken, '登録しました。アプリへの要望をここに送ってください。\n（送り終わって3分たつと、Claudeに渡します）');
      } else reply_(ev.replyToken, '番号がちがいます。');
      continue;
    }
    if (!allow.includes(uid)) continue; // 登録していない人のメッセージは無視
    let item = null;
    if (m.type === 'text') item = { t: text };
    else if (m.type === 'image') item = { img: saveImage_(m.id) };
    else continue;
    const first = push_(Object.assign(item, { at: Date.now(), who: allow.indexOf(uid) }));
    if (first) reply_(ev.replyToken, '受け取りました📝 続けて送ってOKです。送り終わって' + WAIT_MIN + '分たったら、Claudeに渡します。');
  }
  return ok_();
}

// ---- Claude からの返事・画像の取り出し ----
// 返事：GET ?k=KEY&say=本文   画像：GET ?k=KEY&img=ファイルID（base64 の文字で返す）
function doGet(e) {
  const p = e.parameter || {};
  if (!p.k || p.k !== P.getProperty('KEY')) return ContentService.createTextOutput('ng');
  if (p.img) {
    const f = DriveApp.getFileById(p.img);
    return ContentService.createTextOutput(Utilities.base64Encode(f.getBlob().getBytes()));
  }
  if (p.say) {
    const to = (P.getProperty('ALLOW') || '').split(',').filter(Boolean);
    to.forEach(uid => line_('push', { to: uid, messages: [{ type: 'text', text: String(p.say).slice(0, 4900) }] }));
    return ContentService.createTextOutput('sent');
  }
  return ContentService.createTextOutput('ok');
}

// ---- ためる・渡す ----
// ためたメッセージは1件ずつ別のプロパティ（Q_時刻_番号）に入れる（1つのプロパティは約9KBまでなので）
function queue_() { const all = P.getProperties(); return Object.keys(all).filter(k => k.indexOf('Q_') === 0).sort().map(k => Object.assign(JSON.parse(all[k]), { k })); }
function push_(item) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const q = queue_(), first = !q.length;
    if (item.t) item.t = item.t.slice(0, 2500);
    P.setProperty('Q_' + String(item.at).padStart(15, '0') + '_' + Math.floor(Math.random() * 1e6), JSON.stringify(item));
    q.slice(0, Math.max(0, q.length + 1 - MAX_QUEUE)).forEach(x => P.deleteProperty(x.k)); // 多すぎたら古いものから捨てる
    if (first) schedule_();
    return first;
  } finally { lock.releaseLock(); }
}
function schedule_() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'flush').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('flush').timeBased().after(WAIT_MIN * 60 * 1000).create();
}
function flush() {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  let q;
  try {
    ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'flush').forEach(t => ScriptApp.deleteTrigger(t));
    q = queue_(); if (!q.length) return;
    const last = q[q.length - 1].at;
    if (Date.now() - last < WAIT_MIN * 60 * 1000 - 5000) { schedule_(); return; } // まだ送っている途中
    q.forEach(x => P.deleteProperty(x.k));
  } finally { lock.releaseLock(); }
  // 「ありがとう」などのあいさつだけなら、Claude には渡さない
  if (q.every(x => x.t && CHAT_ONLY.test(x.t))) return;
  const url = P.getProperty('WEB_URL') || ScriptApp.getService().getUrl(), key = P.getProperty('KEY');
  const lines = q.map(x => x.t != null ? x.t : '[画像] ' + url + '?k=' + key + '&img=' + x.img);
  const text = [
    '【妻からの要望（LINE）】', lines.join('\n'), '',
    '【返事の送り方】GET ' + url + '?k=' + key + '&say=（本文をURLエンコード）',
    '【画像の取り出し方】上の [画像] のURLを GET すると base64 の文字が返る（curl -sL → base64 -d）',
  ].join('\n');
  const r = UrlFetchApp.fetch(P.getProperty('FIRE_URL'), {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + P.getProperty('FIRE_TOKEN'), 'anthropic-beta': 'experimental-cc-routine-2026-04-01', 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ text: text.slice(0, 60000) }),
  });
  const ok = r.getResponseCode() < 300;
  if (!ok) { // 失敗したら、ためたものを戻して後でもう一度
    const lock2 = LockService.getScriptLock(); lock2.waitLock(20000);
    try { q.forEach(x => { const k = x.k; delete x.k; P.setProperty(k, JSON.stringify(x)); }); schedule_(); } finally { lock2.releaseLock(); }
    Logger.log('Claude に渡せませんでした：' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 300));
  }
  const say = ok ? 'Claudeに渡しました。直したら、ここに連絡します。' : 'Claudeに渡せませんでした。少ししてからもう一度ためします。';
  (P.getProperty('ALLOW') || '').split(',').filter(Boolean).forEach(uid => line_('push', { to: uid, messages: [{ type: 'text', text: say }] }));
}

// ---- 部品 ----
function saveImage_(id) {
  const blob = UrlFetchApp.fetch('https://api-data.line.me/v2/bot/message/' + id + '/content', { headers: { Authorization: 'Bearer ' + P.getProperty('LINE_TOKEN') } }).getBlob();
  const it = DriveApp.getFoldersByName('LINE中継の画像'), dir = it.hasNext() ? it.next() : DriveApp.createFolder('LINE中継の画像');
  return dir.createFile(blob.setName(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd-HHmmss') + '-' + id + '.jpg')).getId(); // 自分のドライブだけに置く（共有しない）
}
function reply_(token, text) { line_('reply', { replyToken: token, messages: [{ type: 'text', text }] }); }
function line_(kind, payload) {
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/' + kind, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + P.getProperty('LINE_TOKEN') }, payload: JSON.stringify(payload),
  });
}
function ok_() { return ContentService.createTextOutput('ok'); }
