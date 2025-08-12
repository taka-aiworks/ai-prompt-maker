/**
 * AIキャラ統一プロンプトメーカー - GAS連携（v1.1.2）
 * - 本番用クリーン版
 * - Sheet1/シート1 を安全に処理（最初はリネーム、それ以外は削除）
 * - JSON / x-www-form-urlencoded 両対応の強化パーサ
 * - シートが削除 or ゴミ箱でも自動再作成（自己修復）
 * - ステータスコードは常に200（本文JSONの ok で判定）
 */

const SHEET_NAME    = "data";              // データ保存タブ名
const PROP_KEY      = "APM_SHEET_ID";      // GAS内部用：スプレッドシートID
const REQUIRE_TOKEN = true;                // トークン必須かどうか（true推奨）

// 保存時に1行目へセットするヘッダー
const HEADERS = [
  "Date", "Name", "Mode",
  "General", "SD", "MJ", "Dalle",
  "Tags", "Note", "Negative",
  "SelectionsJSON", "SettingsJSON", "RecordID"
];

/** 対象シート取得（自己修復＋Sheet1安全処理） */
function getSheet_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(PROP_KEY);
  let ss;

  // 1) IDがあれば生存確認（ゴミ箱判定も）
  if (id) {
    try {
      const file = DriveApp.getFileById(id);
      if (file.isTrashed()) {
        // ゴミ箱なら復元せず新規作成に切替
        ss = SpreadsheetApp.create("APM_Prompts");
        props.setProperty(PROP_KEY, ss.getId());
      } else {
        ss = SpreadsheetApp.openById(id);
        ss.getSheets(); // 軽いアクセスで存在検証
      }
    } catch (e) {
      // 開けない（完全削除/権限喪失など）→ 新規作成
      ss = SpreadsheetApp.create("APM_Prompts");
      props.setProperty(PROP_KEY, ss.getId());
    }
  } else {
    // 初回
    ss = SpreadsheetApp.create("APM_Prompts");
    props.setProperty(PROP_KEY, ss.getId());
  }

  // 2) data を確保（順序が重要）
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    const all = ss.getSheets();
    const first = all.length === 1 ? all[0] : null;
    const candidates = ["Sheet1", "シート1"];
    if (first && candidates.includes(first.getName())) {
      // 最初の1枚だけなら安全にリネームして再利用
      sheet = first;
      sheet.setName(SHEET_NAME);
    } else {
      // それ以外は新規作成
      sheet = ss.insertSheet(SHEET_NAME);
    }
  }

  // 3) 余っている初期シートを削除（残枚数が2枚以上のときだけ）
  const leftovers = ss.getSheets().filter(sh => {
    const n = sh.getName();
    return (n === "Sheet1" || n === "シート1");
  });
  leftovers.forEach(sh => {
    if (ss.getSheets().length > 1) {
      ss.deleteSheet(sh);
    }
  });

  // 4) ヘッダーが無ければセット
  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (firstRow.every(v => !v)) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** トークンチェック */
function checkToken_(token) {
  if (!REQUIRE_TOKEN) return true;
  const saved = PropertiesService.getScriptProperties().getProperty("APM_SHARED_TOKEN") || "";
  return token && saved && token === saved;
}

/** 保存（POST） */
function doPost(e) {
  try {
    const p = parsePost_(e);
    if (!checkToken_(p.token)) return json_({ ok:false, error:"invalid token" });

    const sheet = getSheet_();
    sheet.appendRow([
      new Date(),
      p.name || "",
      p.mode || "single",
      p.general || "",
      p.sd || "",
      p.mj || "",
      p.dalle || "",
      p.tags || "",
      p.note || "",
      p.negative || "",
      p.selections_json || "{}",
      p.settings_json || "{}",
      p.record_id || String(Date.now())
    ]);

    return json_({ ok:true, message:"saved", sheetId: sheet.getParent().getId() });
  } catch(err) {
    return json_({ ok:false, error:String(err) });
  }
}

/** 取得（GET） */
function doGet(e) {
  try {
    const q = (e && e.parameter) || {};
    if (!checkToken_(q.token)) return json_({ ok:false, error:"invalid token" });

    const sheet = getSheet_();
    const last = sheet.getLastRow();
    if (last < 2) return json_({ ok:true, items:[] });

    const values = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
    let items = values.map(row => {
      const o = {};
      HEADERS.forEach((h, i) => { o[h.toLowerCase()] = row[i]; });
      return {
        date: o.date,
        name: o.name,
        mode: o.mode,
        general: o.general,
        sd: o.sd,
        mj: o.mj,
        dalle: o.dalle,
        tags: o.tags,
        note: o.note,
        negative: o.negative,
        selections_json: o.selectionsjson,
        settings_json: o.settingsjson,
        record_id: o.recordid
      };
    });

    // フィルタ
    if (q.name) { const s = String(q.name).toLowerCase(); items = items.filter(x => (x.name||"").toLowerCase().includes(s)); }
    if (q.tag)  { const s = String(q.tag ).toLowerCase(); items = items.filter(x => (x.tags||"").toLowerCase().includes(s)); }
    if (q.record_id) items = items.filter(x => x.record_id === q.record_id);
    if (q.since) { const since = new Date(q.since); if (!isNaN(since)) items = items.filter(x => new Date(x.date) >= since); }

    // 降順＋limit
    items.sort((a,b)=> new Date(b.date) - new Date(a.date));
    items = items.slice(0, Math.max(1, Math.min(Number(q.limit || 50), 500)));

    return json_({ ok:true, items });
  } catch(err) {
    return json_({ ok:false, error:String(err) });
  }
}

/** POST本文の強化パース（JSON / x-www-form-urlencoded 両対応） */
function parsePost_(e) {
  if (e && e.postData && typeof e.postData.contents === "string") {
    var raw = e.postData.contents || "";
    var ct  = String(e.postData.type || "").toLowerCase();

    if (ct.indexOf("application/json") >= 0) {
      try { return JSON.parse(raw || "{}"); } catch (_) { return {}; }
    }
    // 手動URLデコード（Content-Typeが曖昧でも拾う）
    var params = {};
    raw.split("&").forEach(function (kv) {
      if (!kv) return;
      var idx = kv.indexOf("=");
      var k = idx >= 0 ? kv.slice(0, idx) : kv;
      var v = idx >= 0 ? kv.slice(idx + 1) : "";
      try {
        k = decodeURIComponent(k.replace(/\+/g, " "));
        v = decodeURIComponent(v.replace(/\+/g, " "));
      } catch(_) {}
      params[k] = v;
    });
    if (Object.keys(params).length) return params;
  }
  return (e && e.parameter) ? e.parameter : {};
}

/** JSON返却（200固定） */
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ===================== 管理用（トークン設定） ===================== */

/**
 * ★ ユーザー操作ポイント
 * 共有トークンを保存
 * - ユーザーは initSetToken() 内の "APM_SHARED_TOKEN" を自分の好きな長い文字列に変更し、
 *   その1回だけ ▶ 実行すればOK
 */
function setSharedToken(token) {
  if (typeof token !== "string" || !token.trim()) {
    throw new Error('Token is required: setSharedToken("<your-token>")');
  }
  PropertiesService.getScriptProperties().setProperty("APM_SHARED_TOKEN", token.trim());
}

/**
 * ★ ユーザー操作ポイント
 * 一度だけ実行するラッパー
 * "APM_SHARED_TOKEN" を変更して ▶ 実行
 */
function initSetToken(){
  setSharedToken("APM_SHARED_TOKEN"); // ←ここを好きな長い文字列に変更
}

/** 設定済みトークンの確認（ログ出力） */
function debugReadToken(){
  const t = PropertiesService.getScriptProperties().getProperty("APM_SHARED_TOKEN");
  Logger.log(t || "(none)");
}
