/**
 * AIキャラ統一プロンプトメーカー - GAS連携（v1.0.2）
 * - CORSヘッダ・setStatusCode を使わないシンプル版
 */

const SHEET_NAME = "data";
const PROP_KEY   = "APM_SHEET_ID";
const REQUIRE_TOKEN = true;

const HEADERS = [
  "Date", "Name", "Mode",
  "General", "SD", "MJ", "Dalle",
  "Tags", "Note", "Negative",
  "SelectionsJSON", "SettingsJSON", "RecordID"
];

function getSheet_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(PROP_KEY);
  let ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create("APM_Prompts");
  if (!id) props.setProperty(PROP_KEY, ss.getId());
  let sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  const vals = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (vals.filter(String).length === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function checkToken_(token) {
  if (!REQUIRE_TOKEN) return true;
  const saved = PropertiesService.getScriptProperties().getProperty("APM_SHARED_TOKEN") || "";
  return token && saved && token === saved;
}

/** 受信→保存 */
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

/** 一覧取得 */
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

    if (q.name) { const s = String(q.name).toLowerCase(); items = items.filter(x => (x.name||"").toLowerCase().includes(s)); }
    if (q.tag)  { const s = String(q.tag ).toLowerCase(); items = items.filter(x => (x.tags||"").toLowerCase().includes(s)); }
    if (q.record_id) items = items.filter(x => x.record_id === q.record_id);
    if (q.since) { const since = new Date(q.since); if (!isNaN(since)) items = items.filter(x => new Date(x.date) >= since); }

    items.sort((a,b)=> new Date(b.date) - new Date(a.date));
    items = items.slice(0, Math.max(1, Math.min(Number(q.limit || 50), 500)));

    return json_({ ok:true, items });
  } catch(err) {
    return json_({ ok:false, error:String(err) });
  }
}

/** フォーム or JSON どちらでも受ける */
function parsePost_(e) {
  const p = (e && e.parameter) || {};
  if (e && e.postData && e.postData.type && e.postData.contents) {
    const ct = String(e.postData.type).toLowerCase();
    if (ct.indexOf("application/json") >= 0) return JSON.parse(e.postData.contents || "{}");
  }
  return p;
}

/** JSON返却（200固定） */
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 管理用 */
function setSharedToken(token) {
  PropertiesService.getScriptProperties().setProperty("APM_SHARED_TOKEN", token);
}
function getSpreadsheetUrl() {
  const id = PropertiesService.getScriptProperties().getProperty(PROP_KEY);
  return id ? "https://docs.google.com/spreadsheets/d/" + id : "";
}
