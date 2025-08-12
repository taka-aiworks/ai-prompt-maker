/**
 * AIキャラ統一プロンプトメーカー - GAS連携
 * v1.0 (2025-08-12)
 * - doPost: 受信データをシートへ append
 * - doGet : シートからレコード一覧を JSON で返す（フィルタ可）
 * - CORS & 簡易トークン対応
 *
 * ■想定POSTパラメータ (application/x-www-form-urlencoded)
 * token, name, mode, general, sd, mj, dalle, tags, note, negative,
 * selections_json, settings_json, record_id
 *
 * ■想定GETパラメータ
 * token, limit, name, tag, since, record_id
 */

const SHEET_NAME = "data";
const PROP_KEY   = "APM_SHEET_ID"; // プロパティに保存
const REQUIRE_TOKEN = false;        // trueにすると token 必須
const ALLOW_ORIGINS = ["*"];        // 必要ならここにドメインを列挙

/** ヘッダー */
const HEADERS = [
  "Date", "Name", "Mode",
  "General", "SD", "MJ", "Dalle",
  "Tags", "Note", "Negative",
  "SelectionsJSON", "SettingsJSON", "RecordID"
];

/** 共通：CORSヘッダー */
function withCors_(output) {
  const headers = {
    "Access-Control-Allow-Origin": ALLOW_ORIGINS.join(",") || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  output.setHeaders(headers);
  return output;
}

/** シート取得（初回は自動作成） */
function getSheet_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(PROP_KEY);
  let ss;

  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create("APM_Prompts");
    props.setProperty(PROP_KEY, ss.getId());
  }

  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  // ヘッダーが無ければ付与
  const range = sheet.getRange(1, 1, 1, HEADERS.length);
  const values = range.getValues()[0];
  const needHeader = values.filter(String).length === 0;
  if (needHeader) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** 簡易トークンチェック */
function checkToken_(token) {
  if (!REQUIRE_TOKEN) return true;
  const saved = PropertiesService.getScriptProperties().getProperty("APM_SHARED_TOKEN") || "";
  return token && saved && token === saved;
}

/** OPTIONS (CORS preflight) */
function doOptions() {
  const out = ContentService.createTextOutput("");
  return withCors_(out);
}

/** 受信→保存 */
function doPost(e) {
  try {
    const p = parsePost_(e);
    if (!checkToken_(p.token)) {
      return json_({ ok:false, error:"invalid token" }, 401);
    }
    const sheet = getSheet_();

    const row = [
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
    ];
    sheet.appendRow(row);

    return json_({ ok:true, message:"saved", sheetId: sheet.getParent().getId() });
  } catch(err) {
    return json_({ ok:false, error:String(err) }, 500);
  }
}

/** 一覧取得（フィルタ可） */
function doGet(e) {
  try {
    const q = (e && e.parameter) || {};
    if (!checkToken_(q.token)) {
      return json_({ ok:false, error:"invalid token" }, 401);
    }
    const sheet = getSheet_();
    const last = sheet.getLastRow();
    if (last < 2) return json_({ ok:true, items:[] });

    const values = sheet.getRange(2,1, last-1, HEADERS.length).getValues();
    let items = values.map(row => {
      const obj = {};
      HEADERS.forEach((h, i) => { obj[h.toLowerCase()] = row[i]; });
      // keys: date,name,mode,general,sd,mj,dalle,tags,note,negative,selectionsjson,settingsjson,recordid
      return {
        date: obj.date,
        name: obj.name,
        mode: obj.mode,
        general: obj.general,
        sd: obj.sd,
        mj: obj.mj,
        dalle: obj.dalle,
        tags: obj.tags,
        note: obj.note,
        negative: obj.negative,
        selections_json: obj.selectionsjson,
        settings_json: obj.settingsjson,
        record_id: obj.recordid
      };
    });

    // フィルタ
    if (q.name) {
      const s = String(q.name).toLowerCase();
      items = items.filter(x => (x.name||"").toLowerCase().indexOf(s) >= 0);
    }
    if (q.tag) {
      const s = String(q.tag).toLowerCase();
      items = items.filter(x => (x.tags||"").toLowerCase().indexOf(s) >= 0);
    }
    if (q.record_id) {
      items = items.filter(x => x.record_id === q.record_id);
    }
    if (q.since) {
      const since = new Date(q.since);
      if (!isNaN(since)) {
        items = items.filter(x => new Date(x.date) >= since);
      }
    }

    // 降順（新しい→古い）
    items.sort((a,b)=> new Date(b.date) - new Date(a.date));

    // limit
    const limit = Math.max(1, Math.min( Number(q.limit || 50), 500 ));
    items = items.slice(0, limit);

    return json_({ ok:true, items });
  } catch(err) {
    return json_({ ok:false, error:String(err) }, 500);
  }
}

/** POST本文を x-www-form-urlencoded / JSON どちらでも受ける */
function parsePost_(e) {
  const p = (e && e.parameter) || {};
  if (e && e.postData && e.postData.type && e.postData.contents) {
    const ct = String(e.postData.type).toLowerCase();
    if (ct.indexOf("application/json") >= 0) {
      const body = JSON.parse(e.postData.contents || "{}");
      return body;
    }
    // application/x-www-form-urlencoded は e.parameter でOK
  }
  return p;
}

/** JSON返却 */
function json_(obj, status) {
  const out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  if (status) out.setStatusCode(status);
  return withCors_(out);
}

/** 管理用：共有トークンを設定（手動呼び出し用） */
function setSharedToken(token) {
  PropertiesService.getScriptProperties().setProperty("APM_SHARED_TOKEN", token);
}

/** 管理用：現在のスプレッドシートURLを取得 */
function getSpreadsheetUrl() {
  const id = PropertiesService.getScriptProperties().getProperty(PROP_KEY);
  return id ? "https://docs.google.com/spreadsheets/d/" + id : "";
}
