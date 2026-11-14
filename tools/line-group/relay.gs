/**
 * グループLINE（公式アカウント・妻・夫）の会話 → Claude の会話に届ける中継（Google Apps Script）
 *
 * 流れ：登録したグループの中の会話だけをためて、2分間つづきがなければ（または「おねがい」「以上」と送ったらすぐ）
 *       Claude のスケジュールタスク（API トリガー）に渡す。タスクは夫が使っている Claude の会話に届き、
 *       夫がそこで読んで添削・指示する。Claude からグループに返事はしない（登録のときだけ返事をする）。
 *       1対1のトーク・ほかのグループ・複数人トークの会話は無視する。
 *
 * スクリプト プロパティ（プロジェクトの設定 → スクリプト プロパティ）に入れるもの：
 *   LINE_TOKEN … LINE のチャネルアクセストークン（長期）
 *   FIRE_URL   … Claude のスケジュールタスクの Fire URL（…/fire）
 *   FIRE_TOKEN … そのタスクの API トークン（sk-ant-oat01-…）
 *   WEB_URL    … このスクリプトをウェブアプリとしてデプロイしたときの URL（…/exec）
 * setup() を一度実行すると、次のものは自動で入る：
 *   KEY      … 画像の取り出し用の合言葉
 *   HOOK     … LINE の Webhook URL の後ろに付ける合言葉（実行ログに出る URL をそのまま LINE に入れる）
 *   REG_CODE … グループで「登録 ○○○○○○」と送るときの6桁の番号（実行ログに出る。30分で無効。登録したら、または5回まちがえたら消える）
 *   GROUP    … 登録したグループのID
 *   OWNER    … 登録した人（夫）の LINE のID（うまく渡せないときのお知らせ先。メールでも知らせる）
 * LINE 側の設定：グループ・複数人トークへの参加を許可する＝オン、応答メッセージ・あいさつメッセージ＝オフ、Webhookの再送＝オフ。
 * 夫は公式アカウントを友だち追加しておく（止まったときの LINE のお知らせが届くように）。
 */
const P = PropertiesService.getScriptProperties();
const WAIT_MIN = 2;                 // 最後のメッセージから何分待ってから Claude に渡すか
const MAX_QUEUE = 40;               // これだけたまったら待たずに渡す
const MAX_KEEP = 400;               // 止まっている間にためる上限（プロパティの容量 500KB を超えないように）
const CHUNK = 2500;                 // 長い1通は、この字数ごとに分けてためる（1つのプロパティは約9KB）
const SEND_BYTES = 40000;           // 1回に渡す量（バイト）。多いときは何回かに分けて渡す
const REG_MIN = 30;                 // 登録の番号が使える時間（分）
const SEND_NOW = /^(おねがい|お願い|お願いします|おねがいします|以上|いじょう|おわり|終わり|送って)[!！。〜ー♡❤️✨🙏\s]*$/;
const BACKOFF_MIN = [3, 10, 30, 60, 120]; // 渡せなかったときの、やり直しまでの分（これを過ぎたら止めて夫に知らせる）

function setup() {
  if (!P.getProperty('KEY')) P.setProperty('KEY', Utilities.getUuid().replace(/-/g, ''));
  if (!P.getProperty('HOOK')) P.setProperty('HOOK', Utilities.getUuid().replace(/-/g, ''));
  if (!P.getProperty('GROUP')) { P.setProperty('REG_CODE', String(100000 + Math.floor(Math.random() * 900000))); P.setProperty('REG_AT', String(Date.now())); P.deleteProperty('REG_FAIL'); }
  ['LINE_TOKEN', 'FIRE_URL', 'FIRE_TOKEN', 'WEB_URL'].forEach(k => { if (!P.getProperty(k)) Logger.log('⚠ まだ入っていません：' + k); });
  const fu = P.getProperty('FIRE_URL') || '';
  if (fu && !/^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/trig_[A-Za-z0-9]+\/fire$/.test(fu)) Logger.log('⚠ FIRE_URL の形がちがうようです：' + fu);
  // 見張り役：10分ごとに、渡し忘れがないか確かめる
  if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'watch')) ScriptApp.newTrigger('watch').timeBased().everyMinutes(10).create();
  const wu = P.getProperty('WEB_URL'); if (wu) Logger.log('LINE の Webhook URL に入れる URL：' + wu + '?h=' + P.getProperty('HOOK'));
  if (P.getProperty('REG_CODE')) Logger.log('登録の番号：' + P.getProperty('REG_CODE') + '（' + REG_MIN + '分以内に、グループLINEの中で、あなたが「登録 ' + P.getProperty('REG_CODE') + '」と送る）');
  else Logger.log('もうグループを登録ずみです（やり直すときは resetGroup を実行してから setup）。');
  Logger.log('準備OK');
}
// グループを登録し直したいとき（別のグループにする等）に手で実行する
function resetGroup() { ['GROUP', 'OWNER', 'REG_CODE', 'REG_FAIL', 'REG_AT'].forEach(k => P.deleteProperty(k)); setup(); }

// ---- LINE からのメッセージ（Webhook） ----
function doPost(e) {
  if (!e.parameter || !e.parameter.h || e.parameter.h !== P.getProperty('HOOK')) return ok_(); // LINE 以外からの送りつけは無視（Webhook URL の合言葉）
  let body; try { body = JSON.parse(e.postData.contents); } catch (_) { return ok_(); }
  let sendNow = false;
  (body.events || []).forEach((ev, idx) => {
    try { if (handle_(ev, idx)) sendNow = true; } catch (err) { Logger.log('doPost: ' + err); }
  });
  if (sendNow) { waitImages_(); flush(true); }
  return ok_();
}
function handle_(ev, idx) {
  if (ev.type !== 'message' || !ev.source || ev.source.type !== 'group') return false; // グループの会話だけ（1対1・複数人トークは使わない）
  if (!firstTime_(ev.webhookEventId)) return false;
  const gid = ev.source.groupId, uid = ev.source.userId || '', m = ev.message, text = m.type === 'text' ? m.text.trim() : '';
  // 登録：グループの中で「登録 1234」
  const reg = text.replace(/\s/g, '').match(/^登録(\d{6})$/);
  if (reg && !P.getProperty('GROUP')) { register_(ev, gid, uid, reg[1]); return false; }
  if (gid !== P.getProperty('GROUP')) return false; // 登録していないグループは無視（返事もしない）
  let item;
  if (m.type === 'text') {
    if (SEND_NOW.test(text) && queue_().length) return true; // 「おねがい」：すぐ渡す（グループには返事しない）
    item = { t: text };
  } else if (m.type === 'image') {
    imgBusy_(1); let id = null;
    try { id = saveImage_(m.id); } finally { imgBusy_(-1); }
    item = id ? { img: id } : { t: '[画像を受け取れませんでした]' };
  } else if (m.type === 'sticker') item = { t: '[スタンプ]' };
  else if (m.type === 'video') item = { t: '[動画（中継できません）]' };
  else if (m.type === 'audio') item = { t: '[音声（中継できません）]' };
  else if (m.type === 'file') item = { t: '[ファイル：' + (m.fileName || '') + '（中継できません）]' };
  else if (m.type === 'location') item = { t: '[位置情報：' + (m.title || m.address || '') + ']' };
  else item = { t: '[' + m.type + ']' };
  const r = push_(Object.assign(item, { at: ev.timestamp || Date.now(), who: name_(gid, uid) }), idx);
  return r.full;
}
function register_(ev, gid, uid, code) {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(20000)) return;
  try {
    if (P.getProperty('GROUP')) return; // 登録ずみ：何も返さない
    const want = P.getProperty('REG_CODE'), at = +(P.getProperty('REG_AT') || 0);
    if (!want || Date.now() - at > REG_MIN * 60000) { P.deleteProperty('REG_CODE'); reply_(ev.replyToken, '番号が使えなくなっています。Apps Script で setup をもう一度実行して、新しい番号で送ってください。'); return; }
    if (!uid) { reply_(ev.replyToken, '送った人が分かりませんでした。もう一度送ってください。'); return; }
    if (code !== want) {
      const n = +(P.getProperty('REG_FAIL') || 0) + 1; P.setProperty('REG_FAIL', String(n));
      if (n >= 5) P.deleteProperty('REG_CODE'); // 5回まちがえたら番号を消す（setup をもう一度実行すると新しい番号）
      reply_(ev.replyToken, '番号がちがいます。'); return;
    }
    P.setProperty('GROUP', gid); P.setProperty('OWNER', uid); P.deleteProperty('REG_CODE'); P.deleteProperty('REG_AT');
    reply_(ev.replyToken, '登録しました。このグループの会話を、Claudeに届けます（返事はしません）。送り終わって' + WAIT_MIN + '分たつか、「おねがい」と送ると届きます。');
  } finally { lock.releaseLock(); }
}

// ---- 画像の取り出し（Claude から）：GET ?k=KEY&img=ファイルID（base64 の文字で返す） ----
function doGet(e) {
  const p = e.parameter || {};
  if (!p.k || p.k !== P.getProperty('KEY')) return text_('ng');
  if (p.img) {
    try {
      const f = DriveApp.getFileById(p.img), par = f.getParents();
      if (!par.hasNext() || par.next().getName() !== 'LINEグループ中継の画像') return text_('ng'); // 中継の画像だけ
      return text_(Utilities.base64Encode(f.getBlob().getBytes()));
    } catch (_) { return text_('ng'); }
  }
  return text_('ok');
}

// ---- ためる・渡す ----
// ためたメッセージは1件ずつ別のプロパティ（Q_時刻_順番）に入れる（1つのプロパティは約9KBまで）
function queue_() { const all = P.getProperties(); return Object.keys(all).filter(k => k.indexOf('Q_') === 0).sort().map(k => Object.assign(JSON.parse(all[k]), { k })); }
function push_(item, idx) {
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try {
    const q = queue_(), first = !q.length;
    if (q.length >= MAX_KEEP) { if (!P.getProperty('FULL_SENT')) { P.setProperty('FULL_SENT', '1'); notify_('Claudeに渡せないまま会話が' + MAX_KEEP + '件たまったので、これより新しい会話はためていません。設定を直して resume を実行してください。'); } return { first, full: true }; }
    // 長い1通は、何件かに分けてためる（続きの印 part を付けて、渡すときにつなぐ）
    const parts = []; if (item.t && item.t.length > CHUNK) { for (let i = 0; i < item.t.length; i += CHUNK) parts.push(item.t.slice(i, i + CHUNK)); } else parts.push(item.t);
    parts.forEach((t, j) => {
      const it = Object.assign({}, item); if (item.t != null) it.t = t; if (j) it.cont = 1;
      P.setProperty('Q_' + String(item.at).padStart(15, '0') + '_' + String(idx).padStart(3, '0') + '_' + String(j).padStart(3, '0') + '_' + Math.floor(Math.random() * 1e4), JSON.stringify(it));
    });
    if (first || !hasTrigger_('flush') || late_()) schedule_(WAIT_MIN * 60000);
    return { first, full: q.length + parts.length >= MAX_QUEUE };
  } finally { lock.releaseLock(); }
}
function hasTrigger_(fn) { return ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === fn); }
function schedule_(ms) {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'flush').forEach(t => ScriptApp.deleteTrigger(t));
  ms = Math.max(60000, ms); ScriptApp.newTrigger('flush').timeBased().after(ms).create();
  P.setProperty('FLUSH_AT', String(Date.now() + ms)); // 予定の時刻（予定どおり動かなかったときに見張り役が気づけるように）
}
// 予定の時刻を2分以上すぎても渡せていない（トリガーが動かなかった・ロックが取れなかった）
function late_() { const at = +(P.getProperty('FLUSH_AT') || 0); return !at || Date.now() - at > 120000; }
// 見張り役（10分ごと）：ためたものがあるのに渡す予定がない・予定がすぎているときは、予定を入れ直す。古い画像（30日）も片づける
function watch() {
  if (queue_().length && !P.getProperty('FIRE_STOP') && (!hasTrigger_('flush') || late_())) schedule_(60000);
  try {
    const it = DriveApp.getFoldersByName('LINEグループ中継の画像'); if (!it.hasNext()) return;
    const fs = it.next().getFiles(), old = Date.now() - 30 * 86400000;
    while (fs.hasNext()) { const f = fs.next(); if (f.getDateCreated().getTime() < old) f.setTrashed(true); }
  } catch (err) { Logger.log('画像の片づけ: ' + err); }
}

function flush(now) {
  const lock = LockService.getScriptLock(); if (!lock.tryLock(25000)) { if (now !== true) schedule_(60000); return; } // ロックが取れない：少しあとにやり直す
  let q;
  try {
    if (now !== true) ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'flush').forEach(t => ScriptApp.deleteTrigger(t));
    if (P.getProperty('FIRE_STOP')) return; // 止まっている（resume で再開）
    const busy = +(P.getProperty('FLUSHING') || 0); if (Date.now() - busy < 120000) return; // ほかの flush が渡している途中
    q = queue_(); if (!q.length) return;
    const quiet = Date.now() - q[q.length - 1].at;
    if (now !== true && quiet < WAIT_MIN * 60000 - 5000 && q.length < MAX_QUEUE) { schedule_(WAIT_MIN * 60000 - quiet); return; } // まだ話している途中：残りの時間だけ待つ
    P.setProperty('FLUSHING', String(Date.now()));
  } finally { lock.releaseLock(); }
  try {
    const take = pick_(q), res = fire_(take);
    if (res.ok) {
      done_(take); P.deleteProperty('FIRE_FAIL'); P.deleteProperty('FULL_SENT');
      if (take.length < q.length) schedule_(60000); // 多くて分けたとき：残りは1分後に続けて渡す
    } else failed_(res);
  } finally { P.deleteProperty('FLUSHING'); }
}
// 1回に渡す分：古い順に SEND_BYTES に収まるだけ（1件目は必ず入れる）
function pick_(q) {
  const out = []; let b = 0;
  for (const x of q) { const n = Utilities.newBlob(JSON.stringify(x)).getBytes().length + 80; if (out.length && b + n > SEND_BYTES) break; out.push(x); b += n; }
  return out;
}
function fire_(q) {
  const url = P.getProperty('WEB_URL') || ScriptApp.getService().getUrl(), key = P.getProperty('KEY');
  const imgs = q.filter(x => x.img).map(x => x.img);
  // 会話は「名前（時刻）> 文」の形。文の中に【…】があっても、下の連絡用の欄とまちがえないように「> 」を付ける
  let n = 0; const tm = at => Utilities.formatDate(new Date(at), 'Asia/Tokyo', 'M/d H:mm');
  const body = q.map(x => (x.cont ? '' : x.who + '（' + tm(x.at) + '）\n') + (x.img ? '> [画像' + (++n) + ']' : (x.cont ? '\u0000' : '') + x.t.split('\n').map(l => '> ' + l).join('\n'))).join('\n').replace(/\n\u0000> /g, ''); // 分けてためた長い1通は、つなぎ直す
  const tail = [
    '', '【連絡用（この欄の値はファイル・PR・コミットに書かない）】',
  ].concat(imgs.map((id, i) => '画像' + (i + 1) + '：curl -sL "' + url + '?k=' + key + '&img=' + id + '" | base64 -d > /tmp/line' + (i + 1) + '.jpg')).join('\n');
  const head = '【グループLINEの会話】\n';
  const text = head + body + '\n' + tail;
  let code = 0, msg = '';
  try {
    const r = UrlFetchApp.fetch(P.getProperty('FIRE_URL'), {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + P.getProperty('FIRE_TOKEN'), 'anthropic-beta': 'experimental-cc-routine-2026-04-01', 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({ text }),
    });
    code = r.getResponseCode(); msg = r.getContentText().slice(0, 300);
  } catch (err) { code = 599; msg = String(err); }
  return { ok: code >= 200 && code < 300, code, msg };
}
function done_(q) { const lock = LockService.getScriptLock(); lock.waitLock(25000); try { q.forEach(x => P.deleteProperty(x.k)); } finally { lock.releaseLock(); } }
function failed_(res) {
  const n = +(P.getProperty('FIRE_FAIL') || 0) + 1; P.setProperty('FIRE_FAIL', String(n));
  Logger.log('Claude に渡せませんでした（' + n + '回目）：' + res.code + ' ' + res.msg);
  const fatal = res.code >= 400 && res.code < 500 && res.code !== 429;
  if (fatal || n > BACKOFF_MIN.length) { // 設定のまちがい・何度やってもだめ：止めて夫に1回だけ知らせる（ためたものは残す）
    P.setProperty('FIRE_STOP', '1');
    notify_('Claudeに渡せなくなりました（' + res.code + '）。FIRE_URL・FIRE_TOKEN を確かめて、Apps Script で resume を実行してください。');
    return;
  }
  if (n === 1) notify_('Claudeに渡せませんでした（' + res.code + '）。少ししてから、自動でやり直します。');
  schedule_(BACKOFF_MIN[n - 1] * 60000);
}
// 止まったあと、設定を直してから手で実行する
function resume() { P.deleteProperty('FIRE_STOP'); P.deleteProperty('FIRE_FAIL'); P.deleteProperty('FLUSHING'); flush(true); }

// ---- 部品 ----
// 話した人の名前（グループのメンバーの表示名。取れなければ「だれか」）。同じ人は6時間覚えておく
function name_(gid, uid) {
  if (!uid) return 'だれか';
  const c = CacheService.getScriptCache(), ck = 'nm_' + uid, hit = c.get(ck); if (hit) return hit;
  let nm = 'だれか';
  try {
    const r = UrlFetchApp.fetch('https://api.line.me/v2/bot/group/' + gid + '/member/' + uid, { headers: { Authorization: 'Bearer ' + P.getProperty('LINE_TOKEN') }, muteHttpExceptions: true });
    if (r.getResponseCode() === 200) nm = JSON.parse(r.getContentText()).displayName || nm;
  } catch (err) { Logger.log('名前: ' + err); }
  if (uid === P.getProperty('OWNER')) nm += '（夫）';
  if (nm.indexOf('だれか') !== 0) c.put(ck, nm, 21600); // 取れたときだけ覚える
  return nm;
}
// 夫へのお知らせ：LINE（友だちのとき）とメール（このスクリプトの持ち主のアドレス）の両方
function notify_(msg) {
  const owner = P.getProperty('OWNER'); if (owner) pushText_(owner, '【グループ中継】' + msg);
  try { MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '【グループ中継】お知らせ', msg); } catch (err) { Logger.log('メール: ' + err); }
}
// 画像を保存している途中の数（「おねがい」で渡すとき、写真が置いていかれないように少し待つ）
function imgBusy_(d) {
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try { const v = Math.max(0, +(P.getProperty('IMG_BUSY') || 0) + d); if (v) P.setProperty('IMG_BUSY', String(v)); else P.deleteProperty('IMG_BUSY'); if (d > 0) P.setProperty('IMG_BUSY_AT', String(Date.now())); }
  finally { lock.releaseLock(); }
}
function waitImages_() {
  Utilities.sleep(1500); // 同時に届いた写真がためられるのを待つ
  for (let i = 0; i < 12 && +(P.getProperty('IMG_BUSY') || 0) > 0 && Date.now() - +(P.getProperty('IMG_BUSY_AT') || 0) < 30000; i++) Utilities.sleep(1000);
}
function firstTime_(id) {
  if (!id) return true;
  const c = CacheService.getScriptCache(); if (c.get('ev_' + id)) return false; c.put('ev_' + id, '1', 21600); return true;
}
function saveImage_(id) {
  try {
    const r = UrlFetchApp.fetch('https://api-data.line.me/v2/bot/message/' + id + '/content', { headers: { Authorization: 'Bearer ' + P.getProperty('LINE_TOKEN') }, muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return null;
    const it = DriveApp.getFoldersByName('LINEグループ中継の画像'), dir = it.hasNext() ? it.next() : DriveApp.createFolder('LINEグループ中継の画像');
    return dir.createFile(r.getBlob().setName(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd-HHmmss') + '-' + id + '.jpg')).getId(); // 自分のドライブだけに置く（共有しない）
  } catch (err) { Logger.log('画像: ' + err); return null; }
}
function reply_(token, text) { return line_('post', '/v2/bot/message/reply', { replyToken: token, messages: [{ type: 'text', text }] }); }
function pushText_(to, text) { return line_('post', '/v2/bot/message/push', { to, messages: [{ type: 'text', text }] }); }
function line_(method, path, payload) {
  try {
    const o = { method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + P.getProperty('LINE_TOKEN') } };
    if (payload) { o.contentType = 'application/json'; o.payload = JSON.stringify(payload); }
    const r = UrlFetchApp.fetch('https://api.line.me' + path, o), code = r.getResponseCode();
    if (code !== 200) Logger.log('LINE ' + path + ' ' + code + ' ' + r.getContentText().slice(0, 200));
    return code;
  } catch (err) { Logger.log('LINE ' + path + ' ' + err); return 0; }
}
function text_(s) { return ContentService.createTextOutput(s); }
function ok_() { return text_('ok'); }
