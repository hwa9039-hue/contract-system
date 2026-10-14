/**
 * 견적 · 설계 반출 현황 — Gmail → 서버 전송 (Google Apps Script)
 *
 * 받은 편지함(Inbox)으로 들어온 메일 중 "보낸 사람 아이디(@ 앞부분)"가 아래 10명 중 하나인 메일만
 * 서버 수신 API(POST /api/emails/export-logs/ingest)로 보낸다. 나머지(외부·광고 메일)는 건너뛴다.
 * 보내는 항목: 메일 ID, 발신일시, 발신자, 수신자(To), 제목, 본문 요약, 첨부
 * 25MB 를 넘는 파일은 MIME 첨부가 아니라 본문 안 구글 드라이브 링크이므로, HTML 에서 링크와 파일명을 뽑아 함께 보낸다.
 *
 * 설치 순서
 *  1) https://script.google.com → 새 프로젝트 → 이 파일 내용을 붙여넣기
 *  2) 왼쪽 ⚙ 프로젝트 설정 → "스크립트 속성"에 두 개 추가
 *       INGEST_URL   = https://api.signtelecom-smartdi.com/api/emails/export-logs/ingest
 *       INGEST_TOKEN = (NAS backend/.env 의 EMAIL_INGEST_TOKEN 과 같은 값)
 *  3) 함수 선택에서 collectExportMails 를 한 번 실행 → 권한 승인
 *     (처음에는 아래 DRY_RUN 을 true 로 두고 "실행 로그"에서 대상 메일이 맞는지 확인한 뒤 false 로 바꾼다)
 *  4) installTrigger 를 한 번 실행 → 이후 10분마다 자동 실행
 *
 * 이미 저장된 메일에 수신자·본문 요약을 채우려면: resetLastRun 실행 → collectExportMails 실행
 * (서버는 같은 메일을 중복 저장하지 않고 빈 칸만 채운다)
 *
 * 토큰은 코드에 쓰지 말고 반드시 스크립트 속성에만 둔다.
 */

// ── 설정 ──────────────────────────────────────────────────────────────────────

// 대상자(이메일 아이디 → 성명). 이 아이디의 메일만 전송한다. 성명은 로그 확인용이다.
var ALLOWED_SENDERS = {
  kk2331: '전기웅',
  nov1st: '유영무',
  sskim: '김성수',
  yongja_lee: '이용자',
  pjb9878: '박재범',
  jslee: '이재승',
  wizard1221: '전재우',
  ssj8845: '신상준',
  hy9039: '정화영',
  jhjoung: '정주희',
};

// 허용할 메일 도메인. 비워 두면 아이디만 보고 도메인은 따지지 않는다(예: hy9039@gmail.com 도 통과).
// 같은 아이디를 쓰는 외부인이 있을 수 있으니, 가능하면 회사 도메인을 넣어 두는 것을 권장한다.
// 예) ['signtelecom.com', 'gmail.com']
var ALLOWED_DOMAINS = [];

var DRY_RUN = false;                 // true: 서버로 보내지 않고 로그만 남긴다(처음 확인용)
var REQUIRE_ATTACHMENT = false;      // true: 첨부파일이 있는 메일만 전송
var SKIP_MESSAGES_FROM_ME = true;    // true: 이 스크립트를 실행하는 계정 본인이 보낸 메일(회신 등)은 건너뜀
var BODY_SUMMARY_LENGTH = 200;       // 본문 요약 글자 수
var INITIAL_LOOKBACK_DAYS = 7;       // 첫 실행 때 거슬러 올라갈 일수
var OVERLAP_MINUTES = 60;            // 매 실행 때 겹쳐서 다시 보는 시간(서버가 중복을 막아 주므로 안전)
var BATCH_SIZE = 100;                // 한 번에 보낼 건수 (서버 한도 200)
var MAX_THREADS_PER_RUN = 500;

var LAST_RUN_KEY = 'LAST_RUN_EPOCH_SEC';

// ── 메인 ──────────────────────────────────────────────────────────────────────

function collectExportMails() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('INGEST_URL');
  var token = props.getProperty('INGEST_TOKEN');
  if (!DRY_RUN && (!url || !token)) {
    throw new Error('스크립트 속성 INGEST_URL / INGEST_TOKEN 을 먼저 설정하세요.');
  }

  var startedAtSec = Math.floor(Date.now() / 1000);
  var lastRunSec = Number(props.getProperty(LAST_RUN_KEY)) || 0;
  var sinceSec = lastRunSec
    ? lastRunSec - OVERLAP_MINUTES * 60
    : startedAtSec - INITIAL_LOOKBACK_DAYS * 24 * 60 * 60;

  var myEmail = SKIP_MESSAGES_FROM_ME ? getMyEmail_() : '';
  var threads = GmailApp.search('in:inbox after:' + sinceSec, 0, MAX_THREADS_PER_RUN);

  var items = [];
  var skipped = 0;
  for (var t = 0; t < threads.length; t++) {
    var messages = threads[t].getMessages();
    for (var m = 0; m < messages.length; m++) {
      var message = messages[m];
      if (message.getDate().getTime() / 1000 < sinceSec) continue;     // 스레드 안의 오래된 메일
      if (message.isInTrash()) continue;

      var from = message.getFrom();
      var email = extractEmail_(from);
      if (myEmail && email === myEmail) { skipped++; continue; }
      if (!isAllowedSender_(email)) { skipped++; continue; }           // 외부·광고 메일 건너뜀

      var plainBody = '';
      var htmlBody = '';
      try { plainBody = message.getPlainBody(); } catch (e) { plainBody = ''; }
      try { htmlBody = message.getBody(); } catch (e2) { htmlBody = ''; }
      var mimeFiles = message
        .getAttachments({ includeInlineImages: false, includeAttachments: true })
        .map(function (file) { return { name: file.getName(), url: '' }; });
      var driveFiles = extractDriveLinks_(htmlBody, plainBody);
      var attachments = mergeAttachmentRecords_(mimeFiles, driveFiles);
      if (REQUIRE_ATTACHMENT && attachments.length === 0) { skipped++; continue; }

      items.push({
        messageId: message.getId(),
        sentAt: message.getDate().toISOString(),
        sender: from,
        recipient: message.getTo(),
        subject: message.getSubject(),
        bodySummary: summarizeBody_(plainBody),
        bodyHtml: compactHtml_(htmlBody),
        attachments: attachments,
      });
    }
  }

  Logger.log('검색한 스레드 %s개 / 전송 대상 %s건 / 건너뜀 %s건', threads.length, items.length, skipped);

  if (DRY_RUN) {
    items.forEach(function (item) {
      Logger.log('[DRY_RUN] %s | %s → %s | %s | 첨부 %s개 | 본문: %s',
        item.sentAt, item.sender, item.recipient, item.subject, item.attachments.length, item.bodySummary);
    });
    return; // DRY_RUN 일 때는 마지막 실행 시각을 갱신하지 않는다
  }

  for (var i = 0; i < items.length; i += BATCH_SIZE) {
    postBatch_(url, token, items.slice(i, i + BATCH_SIZE));
  }

  // 전부 성공했을 때만 갱신 → 실패하면 다음 실행 때 같은 구간을 다시 보낸다
  props.setProperty(LAST_RUN_KEY, String(startedAtSec));
}

// ── 보조 함수 ─────────────────────────────────────────────────────────────────

function postBatch_(url, token, batch) {
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Ingest-Token': token },
    payload: JSON.stringify(batch),
    muteHttpExceptions: true,
  });
  var code = response.getResponseCode();
  if (code !== 200) {
    throw new Error('서버 응답 오류 ' + code + ': ' + response.getContentText().slice(0, 300));
  }
  var result = JSON.parse(response.getContentText());
  Logger.log('전송 %s건 → 신규 %s / 갱신 %s / 거부 %s',
    batch.length, result.inserted, result.updated, (result.rejected || []).length);
  if (result.rejected && result.rejected.length) {
    Logger.log('거부된 항목: %s', JSON.stringify(result.rejected));
  }
}

/**
 * 본문 요약 만들기.
 *  1) 인용(>로 시작하는 줄) 제거
 *  2) HTML 엔티티를 실제 문자로 바꾸기 (&nbsp; → 공백, &lt; → <, &gt; → >, &amp; → & ...)
 *  3) 연속 공백·줄바꿈·보이지 않는 문자 정리, 앞뒤 구분선(|) 정리
 *  4) 앞부분만 남기기
 */
function summarizeBody_(plainBody) {
  var text = String(plainBody || '')
    .split(/\r?\n/)
    .filter(function (line) { return line.trim().charAt(0) !== '>'; })
    .join('\n');
  return cleanText_(text).substring(0, BODY_SUMMARY_LENGTH);
}

/** 엔티티 치환 + 공백 정돈. 메일 서명(명함)의 '&nbsp;|&nbsp;' 같은 찌꺼기를 없앤다. */
function cleanText_(raw) {
  var named = { nbsp: ' ', lt: '<', gt: '>', quot: '"', apos: "'", ensp: ' ', emsp: ' ', thinsp: ' ' };
  var text = String(raw || '')
    // &nbsp; &lt; &gt; &quot; &apos; … (대소문자 무관). &amp; 는 이중 해석을 막으려고 맨 마지막에 처리한다.
    .replace(/&(nbsp|lt|gt|quot|apos|ensp|emsp|thinsp);/gi, function (_all, name) {
      return named[name.toLowerCase()];
    })
    // 숫자 엔티티: &#160;  &#xA0;
    .replace(/&#(\d+);/g, function (_all, code) { return safeFromCodePoint_(parseInt(code, 10)); })
    .replace(/&#x([0-9a-f]+);/gi, function (_all, code) { return safeFromCodePoint_(parseInt(code, 16)); })
    .replace(/&amp;/gi, '&')
    // 줄바꿈 없는 공백(U+00A0)·전각 공백 등 특수 공백 → 일반 공백, 보이지 않는 문자 제거
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    // 연속 공백·줄바꿈 → 한 칸
    .replace(/\s+/g, ' ')
    // ' |  | ' 처럼 비어 있는 구분선 정리
    .replace(/(\|\s*){2,}/g, '| ')
    .trim();
  // 앞뒤에 남은 구분선 제거
  return text.replace(/^[|\s]+/, '').replace(/[|\s]+$/, '');
}

function safeFromCodePoint_(code) {
  if (!isFinite(code) || code <= 0 || code > 0x10FFFF) return '';
  return code === 0xA0 ? ' ' : String.fromCodePoint(code);
}

/**
 * 대용량 첨부는 Gmail 이 본문 HTML 에 드라이브 링크로 넣는다.
 * 앵커의 href / download / aria-label 과, 링크 앞의 파일명을 첨부 항목으로 만든다.
 */
var DRIVE_FILE_NAME_RE = /([^\s\/\\<>"']{1,180}\.(?:pdf|hwp|hwpx|doc|docx|xls|xlsx|xlsm|ppt|pptx|dwg|dxf|zip|jpe?g|png|gif|tiff?|csv|txt|rvt|skp|ifc|mp4|7z|rar|bmp|webp|svg|xml|msg|eml))/i;

function unwrapDriveUrl_(url) {
  var text = String(url || '').replace(/&amp;/gi, '&').trim().replace(/[).,;]+$/, '');
  if (!text) return '';
  if (/https?:\/\/(?:www\.)?google\.[^/]+\/url/i.test(text)) {
    var wrapped = text.match(/[?&]q=([^&]+)/i);
    if (wrapped) {
      try { text = decodeURIComponent(wrapped[1]).replace(/[).,;]+$/, ''); } catch (e) {}
    }
  }
  if (!/^https?:\/\/(?:drive|docs)\.google\.com\//i.test(text)) return '';
  return text;
}

function driveIdentity_(url) {
  var match = String(url || '').match(/(?:\/(?:file|document|spreadsheets|presentation|drawings)\/d\/|[?&]id=)([A-Za-z0-9_-]{10,})/i);
  return match ? 'id:' + match[1] : String(url || '').toLowerCase();
}

function looksLikeFileName_(text) {
  var value = String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  var match = value.match(DRIVE_FILE_NAME_RE);
  return Boolean(match && match[1] === value);
}

function plainLabel_(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

function attrValue_(attrs, name) {
  var re = new RegExp('\\b' + name + '\\s*=\\s*("|\')([\\s\\S]*?)\\1', 'i');
  var found = String(attrs || '').match(re);
  return found ? found[2].replace(/&amp;/gi, '&').trim() : '';
}

function nearbyFileName_(text, index) {
  var before = plainLabel_(String(text || '').slice(Math.max(0, index - 220), index));
  var flags = 'gi';
  var re = new RegExp(DRIVE_FILE_NAME_RE.source, flags);
  var names = [];
  var found;
  while ((found = re.exec(before))) names.push(found[1]);
  return names.length ? names[names.length - 1] : '';
}

function extractDriveLinks_(html, plain) {
  var found = [];
  var seen = {};

  function add(name, url) {
    var cleaned = unwrapDriveUrl_(url);
    if (!cleaned) return;
    var identity = driveIdentity_(cleaned);
    if (seen[identity]) return;
    var label = plainLabel_(name);
    if (!looksLikeFileName_(label)) label = '';
    seen[identity] = true;
    found.push({ name: label || '대용량 첨부', url: cleaned });
  }

  var source = String(html || '');
  var anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  var anchor;
  while ((anchor = anchorRe.exec(source))) {
    var href = attrValue_(anchor[1], 'href');
    if (!unwrapDriveUrl_(href)) continue;
    var label = attrValue_(anchor[1], 'download') || attrValue_(anchor[1], 'aria-label') || attrValue_(anchor[1], 'title') || anchor[2];
    if (!looksLikeFileName_(plainLabel_(label))) {
      var nearby = nearbyFileName_(source, anchor.index);
      if (nearby) label = nearby;
    }
    add(label, href);
  }

  var plainText = plainLabel_(String(plain || '') + ' ' + source);
  var urlRe = /https?:\/\/(?:drive|docs)\.google\.com\/[^\s<>"']+/gi;
  var urlMatch;
  while ((urlMatch = urlRe.exec(plainText))) {
    add(nearbyFileName_(plainText, urlMatch.index), urlMatch[0]);
  }
  return found;
}

function mergeAttachmentRecords_(mimeFiles, driveFiles) {
  var merged = [];
  var indexByName = {};
  var seenUrl = {};

  function push(item) {
    var name = plainLabel_(item && item.name) || '대용량 첨부';
    var url = unwrapDriveUrl_(item && item.url) || '';
    var nameKey = name.toLowerCase();
    var urlKey = url ? driveIdentity_(url) : '';
    if (urlKey && seenUrl[urlKey]) return;
    if (url && Object.prototype.hasOwnProperty.call(indexByName, nameKey) && !merged[indexByName[nameKey]].url) {
      merged[indexByName[nameKey]].url = url;
      seenUrl[urlKey] = true;
      return;
    }
    if (!url && Object.prototype.hasOwnProperty.call(indexByName, nameKey)) return;
    if (urlKey) seenUrl[urlKey] = true;
    var record = { name: name };
    if (url) record.url = url;
    indexByName[nameKey] = merged.length;
    merged.push(record);
  }

  (mimeFiles || []).forEach(push);
  (driveFiles || []).forEach(push);
  return merged.slice(0, 100);
}

/** 본문 HTML 은 링크 추출용으로만 보내고, 용량을 줄이기 위해 스크립트·인라인 이미지를 뺀다. */
function compactHtml_(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/\s(?:src|href)=["']data:[^"']+["']/gi, '')
    .substring(0, 120000);
}

/** '"홍길동" <a@b.com>' 또는 'a@b.com' → 'a@b.com' (소문자) */
function extractEmail_(from) {
  var match = String(from || '').match(/<([^>]+)>/);
  return (match ? match[1] : String(from || '')).trim().toLowerCase();
}

/** 아이디(@ 앞부분)가 대상자 10명 중 하나인지 검사 */
function isAllowedSender_(email) {
  var at = email.indexOf('@');
  if (at < 1) return false;
  var id = email.slice(0, at);
  var domain = email.slice(at + 1);
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_SENDERS, id)) return false;
  if (ALLOWED_DOMAINS.length > 0 && ALLOWED_DOMAINS.indexOf(domain) === -1) return false;
  return true;
}

function getMyEmail_() {
  try {
    return String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  } catch (e) {
    return '';
  }
}

// ── 자동 실행 설정 ────────────────────────────────────────────────────────────

/** 한 번만 실행. 10분마다 collectExportMails 를 돌리는 트리거를 만든다(중복 생성 방지 포함). */
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'collectExportMails') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('collectExportMails').timeBased().everyMinutes(10).create();
  Logger.log('10분마다 실행되도록 설정했습니다.');
}

/** 처음부터 다시 수집하고 싶을 때(서버는 중복을 막으므로 안전). */
function resetLastRun() {
  PropertiesService.getScriptProperties().deleteProperty(LAST_RUN_KEY);
  Logger.log('마지막 실행 시각을 지웠습니다. 다음 실행은 최근 %s일부터 다시 봅니다.', INITIAL_LOOKBACK_DAYS);
}
