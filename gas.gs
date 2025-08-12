/**
 * AIキャラ統一プロンプトメーカー - GAS連携（修正版）
 * v1.0.1
 * - CORSヘッダ: setHeader を使用
 * - ステータスコードは返さず JSON の ok で判定
 */

const SHEET_NAME = "data";
const PROP_KEY   = "APM_SHEET_ID";
const REQUIRE_TOKEN = false;        // まずは false で接続確認→OK後に true へ
const ALLOW_ORIGINS = ["*"];        // 必要なら ["https://your-domain"] のように1件だけ

const HEADERS = [
  "Date", "Name", "Mode",
  "General", "SD", "MJ", "Dalle",
  "Tags", "Note", "Negative",
  "SelectionsJSON", "SettingsJSON", "RecordID"
];

/** CORS付与（TextOutputに1本ずつ setHeader） */
function withCors_(out) {
  const origin = (ALLOW_ORIGINS && ALLOW_ORIGINS[0]) || "*";
  out.setHeader("Access-Control-Allow-Origin", origin);
  out.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  out.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return out;
}

/** シート取得（初回は自動作成＋ヘッダ行） */
function getSheet_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(PROP_KEY);
  let ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create("APM_Prompts");
  if (!id) props.setProperty(PROP_KEY, ss.getId());

  let sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  const range = sheet.getRange(1, 1, 1, HEADERS.length);
  const vals = range.getValues()[0];
  if (vals.filter(String).length === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** トークン（任意） */
function checkToken_(token) {
  if (!REQUIRE_TOKEN) return true;
  const saved = PropertiesService.getScriptProperties().getProperty("APM_SHARED_TOKEN") || "";
  return token && saved && token === saved;
}

/** CORS preflight */
function doOptions() {
  const out = ContentService.createTextOutput("");
  out.setMimeType(ContentService.MimeType.TEXT);
  return withCors_(out);
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

    const values = sheet.getRange(2,1, last-1, HEADERS.length).getValues();
    let items = values.map(row => {
      const o = {};
      HEADERS.forEach((h,i)=> o[h.toLowerCase()] = row[i]);
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

    if (q.name) {
      const s = String(q.name).toLowerCase();
      items = items.filter(x => (x.name||"").toLowerCase().indexOf(s) >= 0);
    }
    if (q.tag) {
      const s = String(q.tag).toLowerCase();
      items = items.filter(x => (x.tags||"").toLowerCase().indexOf(s) >= 0);
    }
    if (q.record_id) items = items.filter(x => x.record_id === q.record_id);
    if (q.since) {
      const since = new Date(q.since);
      if (!isNaN(since)) items = items.filter(x => new Date(x.date) >= since);
    }

    items.sort((a,b)=> new Date(b.date) - new Date(a.date));
    const limit = Math.max(1, Math.min(Number(q.limit || 50), 500));
    items = items.slice(0, limit);

    return json_({ ok:true, items });
  } catch(err) {
    return json_({ ok:false, error:String(err) });
  }
}

/** x-www-form-urlencoded / JSON どちらでもOK */
function parsePost_(e) {
  const p = (e && e.parameter) || {};
  if (e && e.postData && e.postData.type && e.postData.contents) {
    const ct = String(e.postData.type).toLowerCase();
    if (ct.indexOf("application/json") >= 0) {
      return JSON.parse(e.postData.contents || "{}");
    }
  }
  return p;
}

/** JSON返却（CORS付き） */
function json_(obj) {
  const out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  return withCors_(out);
}

/** 管理用 */
function setSharedToken(token) {
  PropertiesService.getScriptProperties().setProperty("APM_SHARED_TOKEN", token);
}
function getSpreadsheetUrl() {
  const id = PropertiesService.getScriptProperties().getProperty(PROP_KEY);
  return id ? "https://docs.google.com/spreadsheets/d/" + id : "";
}
