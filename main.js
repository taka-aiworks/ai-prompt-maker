/* ===============================
 * AIキャラ統一プロンプトメーカー - main.js
 * 仕様: 2025-08-11 確定版
 * - JSがUIを全描画（index.htmlは#app/#modal-root/#toast-rootのみ）
 * - ハイブリッド保存（ローカルJSON + 任意GAS）
 * - 再生成可能スナップショット
 * - プロンプト順序の統一 / 名前は管理用のみ（本文には入れない）
 * =============================== */

/* ---------- 小ユーティリティ ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const el = (tag, attrs={}, ...children) => {
  const n = document.createElement(tag);
  Object.entries(attrs||{}).forEach(([k,v])=>{
    if(k === "class") n.className = v;
    else if(k === "style") n.style.cssText = v;
    else if(k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  });
  children.flat().forEach(c=>{
    if (c == null) return;
    if (typeof c === "string") n.appendChild(document.createTextNode(c));
    else n.appendChild(c);
  });
  return n;
};

function toast(msg){ 
  const root = $("#toast-root");
  const t = el("div",{class:"toast"}, msg);
  root.appendChild(t);
  setTimeout(()=>{ t.remove(); }, 3000);
}

function openModal(node){
  const root = $("#modal-root");
  root.innerHTML = "";
  root.appendChild(el("div",{class:"modal"}, node));
  root.classList.add("show");
  root.setAttribute("aria-hidden","false");
}
function closeModal(){
  const root = $("#modal-root");
  root.classList.remove("show");
  root.setAttribute("aria-hidden","true");
  root.innerHTML = "";
}

/* ---------- ストレージキー ---------- */
const KEY_SETTINGS = "apm_settings_v2";
const KEY_HISTORY  = "apm_history_v2";
const KEY_PRESETS  = "apm_presets_v2";

/* ---------- グローバル状態 ---------- */
const state = {
  mode: "single",       // single | character
  platform: "general",  // general | sd | mj | dalle
  settings: {
    mj_ar: "3:4",
    mj_v: "6",
    sd_weight: 1.2,
    negative_default: "change hair color, change outfit, extra fingers, deformed",
    gas_url: "",
    gas_token: "",
    sheet_enabled: false
  },
  selected: {},
  customTags: [],
  name: "",
  age: "",
  gender: "girl",
  hairTone: "normal",     // light|normal|dark
  hairEmph: "normal",     // soft|normal|strong
  negative: "",
  history: [],
  presets: {},
};

/* ---------- 辞書（日本語→英語） ---------- */
const DICT = {
  hairColor: {"黒":"black","茶":"brown","金":"blonde","銀":"silver","白":"white","赤":"red","青":"blue","緑":"green","紫":"purple","ピンク":"pink"},
  hairstyle: {"ショート":"short","ボブ":"bob","ロング":"long","ポニーテール":"ponytail","ツインテール":"twin tails","三つ編み":"braids","お団子":"buns"},
  eyeColor: {"黒":"black","茶":"brown","青":"blue","緑":"green","灰":"gray","赤":"red","紫":"purple","金":"gold","琥珀":"amber"},
  expression: {"笑顔":"smile","微笑":"gentle smile","怒り":"angry","泣き":"teary","驚き":"surprised","ウィンク":"wink","照れ":"blush"},
  clothing: {"セーラー服":"sailor uniform","ブレザー":"blazer","ワンピース":"one piece dress","パーカー":"hoodie","着物":"kimono","鎧":"armor","ドレス":"dress","水着":"swimsuit"},
  accessories: {"メガネ":"glasses","帽子":"hat","リボン":"ribbon","ネックレス":"necklace","ヘッドホン":"headphones","髪飾り":"hair ornament"},
  faceAngle: {"正面":"front view","やや上":"slightly upward","やや下":"slightly downward","横顔":"profile"},
  gaze: {"こちらを見る":"looking at viewer","遠くを見る":"looking away","下を見る":"looking down","上を見る":"looking up"},
  shot: {"アップ":"close-up","バストショット":"bust shot","全身":"full body"},
  background: {"教室":"classroom","桜の木の下":"under cherry blossoms","都市夜景":"city at night","海辺":"seaside","森":"forest","神社":"shrine","喫茶店":"cafe"},
  timeOfDay: {"朝":"morning","昼":"daytime","夕方":"sunset","夜":"night"},
  weather: {"晴れ":"clear","曇り":"cloudy","雨":"rain","雪":"snow"},
  lighting: {"逆光":"backlight","柔らかい光":"soft light","スポットライト":"spotlight","リムライト":"rim light"},
  colorTone: {"暖色系":"warm color scheme","寒色系":"cool color scheme","モノクロ":"monochrome"},
  pose: {"立ち":"standing","座り":"sitting","走り":"running","ジャンプ":"jumping","振り向き":"turning back","手を振る":"waving hand"}
};

/* ---------- カテゴリメタ（UIスキーマ） ---------- */
const CATEGORY_META = [
  { key:"modePlatform", title:"モード / 出力先 / プリセット", layout:"grid", fields:[
    { key:"mode", type:"radio", options:[["single","一発生成"],["character","キャラ統一"]] },
    { key:"platform", type:"radio", options:[["general","汎用"],["sd","Stable Diffusion"],["mj","Midjourney"],["dalle","DALL·E"]] },
    { key:"presetOps", type:"preset" }
  ]},
  { key:"character", title:"キャラ基本", layout:"grid", fields:[
    { key:"name", label:"キャラ名（統一モード時は必須）", type:"text", placeholder:"例：Rino" },
    { key:"age", label:"年齢", type:"number", placeholder:"18" },
    { key:"gender", label:"性別", type:"radio", options:[["girl","女の子"],["boy","男の子"],["androgynous","中性的"]] },
  ]},
  { key:"hair", title:"髪", layout:"grid", fields:[
    { key:"hairColor", label:"髪色", type:"radio+free", options:["黒","茶","金","銀","白","赤","青","緑","紫","ピンク"] },
    { key:"hairTone", label:"髪色トーン", type:"radio", options:[["light","明るい"],["normal","標準"],["dark","暗い"]] },
    { key:"hairstyle", label:"髪型", type:"radio+free", options:["ショート","ボブ","ロング","ポニーテール","ツインテール","三つ編み","お団子"] },
    { key:"hairEmph", label:"髪型の強調", type:"radio", options:[["soft","弱め"],["normal","普通"],["strong","強め"]] },
  ]},
  { key:"face", title:"顔 / 目 / 表情", layout:"grid", fields:[
    { key:"eyeColor", label:"目の色", type:"radio+free", options:["黒","茶","青","緑","灰","赤","紫","金","琥珀"] },
    { key:"expression", label:"表情", type:"checkbox+free", options:["笑顔","微笑","怒り","泣き","驚き","ウィンク","照れ"] },
  ]},
  { key:"outfit", title:"服装 / 小物", layout:"grid", fields:[
    { key:"clothing", label:"服装", type:"radio+free", options:["セーラー服","ブレザー","ワンピース","パーカー","着物","鎧","ドレス","水着"] },
    { key:"accessories", label:"小物", type:"checkbox", options:["メガネ","帽子","リボン","ネックレス","ヘッドホン","髪飾り"] },
  ]},
  { key:"layout", title:"構図 / 視点 / 背景", layout:"grid", fields:[
    { key:"faceAngle", label:"顔の角度", type:"radio", options:[["正面","正面"],["やや上","やや上"],["やや下","やや下"],["横顔","横顔"]] },
    { key:"gaze", label:"視線", type:"radio", options:[["こちらを見る","こちらを見る"],["遠くを見る","遠くを見る"],["下を見る","下を見る"],["上を見る","上を見る"]] },
    { key:"shot", label:"ショット", type:"radio", options:[["アップ","アップ"],["バストショット","バストショット"],["全身","全身"]] },
    { key:"background", label:"背景", type:"radio+free", options:["教室","桜の木の下","都市夜景","海辺","森","神社","喫茶店"] },
    { key:"timeOfDay", label:"時間帯", type:"radio", options:[["朝","朝"],["昼","昼"],["夕方","夕方"],["夜","夜"]] },
    { key:"weather", label:"天候", type:"radio", options:[["晴れ","晴れ"],["曇り","曇り"],["雨","雨"],["雪","雪"]] },
    { key:"lighting", label:"ライティング", type:"radio", options:[["逆光","逆光"],["柔らかい光","柔らかい光"],["スポットライト","スポットライト"],["リムライト","リムライト"]] },
    { key:"colorTone", label:"色調", type:"radio", options:[["暖色系","暖色系"],["寒色系","寒色系"],["モノクロ","モノクロ"]] },
    { key:"pose", label:"ポーズ", type:"radio+free", options:["立ち","座り","走り","ジャンプ","振り向き","手を振る"] },
    { key:"customTags", label:"カスタムタグ（カンマ区切り）", type:"text", placeholder:"例: soft shading, detailed background" },
  ]},
  { key:"assist", title:"生成補助", layout:"grid", fields:[
    { key:"negative", label:"ネガティブプロンプト", type:"textarea", placeholder:"未入力なら既定を使用" },
    { key:"lora", label:"LoRAタグ", type:"checkbox+free", options:["lora:animeLine","lora:cleanColoring"] },
    { key:"control", label:"ControlNetメモ", type:"checkbox+free", options:["depth","canny","pose"] },
  ]},
  { key:"settings", title:"設定 / 連携", layout:"grid", fields:[
    { key:"mj_ar", label:"MJ --ar", type:"text", placeholder:"3:4" },
    { key:"mj_v",  label:"MJ --v", type:"text", placeholder:"6" },
    { key:"sd_weight", label:"SD 主要重み", type:"number", placeholder:"1.2" },
    { key:"negative_default", label:"既定Negative", type:"text", placeholder:"change hair color, ..." },
    { key:"gas_url", label:"GAS Web App URL（任意）", type:"text", placeholder:"https://script.google.com/macros/s/..." },
    { key:"gas_token", label:"Shared Token（任意）", type:"text", placeholder:"一致した人だけ保存/取得可" },
    { key:"sheet_enabled", label:"スプレッドシート出力を有効にする", type:"toggle" },
  ]},
];

/* ---------- プロンプト順序（統一用） ---------- */
/* 上ほど先に出力される。未入力は自動スキップ。 */
const ORDER = [
  "who",          // 誰？（年齢×性別のみ。名前は入れない）
  "hairPrimary",  // 髪色トーン→色
  "hairStyle",    // 髪型 + 強調
  "eyes",         // 目の色
  "expression",   // 表情
  "clothing",     // 服
  "accessories",  // 小物
  "pose",         // ポーズ
  "faceAngle",    // 顔の角度
  "gaze",         // 視線
  "shot",         // 構図/ショット
  "background",   // 背景
  "timeOfDay",    // 時間帯
  "weather",      // 天候
  "lighting",     // ライティング
  "colorTone",    // 色調
  "customTags"    // カスタムタグ
];

/* ---------- 並び替えアセンブラー ---------- */
function assembleParts(map){
  const uniq = (arr)=> [...new Set(arr.filter(Boolean))];
  const ordered = [];
  for (const key of ORDER){
    const v = map[key];
    if (!v) continue;
    if (Array.isArray(v)) ordered.push(...uniq(v));
    else ordered.push(v);
  }
  // ORDERに無いキー（将来拡張分）があれば末尾に連結
  for (const [k,v] of Object.entries(map)){
    if (ORDER.includes(k) || !v) continue;
    if (Array.isArray(v)) ordered.push(...uniq(v));
    else ordered.push(v);
  }
  return uniq(ordered);
}

/* ---------- レンダリング ---------- */
function mount(){
  const app = $("#app");
  app.innerHTML = "";
  renderTopBar(app);
  renderForm(app);
  renderOutput(app);
  renderHistory(app);
  renderSettings(app);
  wireGlobalButtons();
  loadFromStorage();
  refreshAll();
}
function renderTopBar(root){
  const sec = el("section",{class:"section"});
  const left = el("div",{class:"row wrap-inline gap12"},
    el("div",{class:"group"},
      el("div",{class:"label"},"モード"),
      el("label",{class:"radio"}, el("input",{type:"radio",name:"mode",value:"single",checked:true,onchange:onModeChange}), "一発生成"),
      el("label",{class:"radio"}, el("input",{type:"radio",name:"mode",value:"character",onchange:onModeChange}), "キャラ統一"),
    ),
    el("div",{class:"group"},
      el("div",{class:"label"},"出力先"),
      ...[["general","汎用"],["sd","Stable Diffusion"],["mj","Midjourney"],["dalle","DALL·E"]].map(([v,t])=>
        el("label",{class:"radio"}, el("input",{type:"radio",name:"platform",value:v,checked:v==="general",onchange:onPlatformChange}), t)
      )
    ),
  );
  const right = el("div",{class:"row gap8 right wrap-inline"},
    el("button",{id:"btnGenerate",class:"btn"}, "プロンプト生成"),
    el("button",{id:"btnCopyShown",class:"btn ghost"}, "表示中をコピー"),
    el("button",{id:"btnCopyAll",class:"btn ghost"}, "全部コピー"),
    el("button",{id:"btnExport",class:"btn"}, "エクスポート"),
    el("button",{id:"btnImportJson",class:"btn ghost"}, "JSONインポート"),
    el("button",{id:"btnImportSheet",class:"btn ghost"}, "シートからインポート"),
  );
  sec.append(el("div",{class:"row space-between wrap-inline"}, left, right));
  root.appendChild(sec);
}
function renderForm(root){
  const sec = el("section",{class:"section"});
  sec.appendChild(el("h2",{},"フォーム"));
  const form = el("div",{id:"formArea",class:"grid"});
  CATEGORY_META.forEach(cat=>{
    if (cat.key==="modePlatform" || cat.key==="settings") return;
    const fieldset = el("div",{class:"grid-full section m0"});
    fieldset.appendChild(el("h2",{},cat.title));
    const grid = el("div",{class: cat.layout==="grid-3" ? "grid grid-3" : "grid"});
    cat.fields.forEach(f=> grid.appendChild(renderField(f)));
    fieldset.appendChild(grid);
    form.appendChild(fieldset);
  });
  root.appendChild(form);
}
function renderOutput(root){
  const sec = el("section",{class:"section"});
  sec.appendChild(el("h2",{},"出力"));
  const grid = el("div",{class:"grid"});
  grid.append(
    el("div",{}, el("div",{class:"label"},"汎用"), el("div",{id:"out_general",class:"pre"})),
    el("div",{}, el("div",{class:"label"},"Stable Diffusion"), el("div",{id:"out_sd",class:"pre"})),
    el("div",{}, el("div",{class:"label"},"Midjourney"), el("div",{id:"out_mj",class:"pre"})),
    el("div",{}, el("div",{class:"label"},"DALL·E"), el("div",{id:"out_dalle",class:"pre"})),
  );
  sec.appendChild(grid);
  root.appendChild(sec);
}
function renderHistory(root){
  const sec = el("section",{class:"section"});
  sec.appendChild(el("h2",{},"履歴"));
  const tools = el("div",{class:"row space-between wrap-inline"},
    el("input",{id:"hisSearch",class:"input",placeholder:"キーワード検索"}),
    el("div",{class:"row gap8"},
      el("button",{id:"btnHisRefresh",class:"btn ghost"},"更新"),
      el("button",{id:"btnHisClear",class:"btn danger"},"履歴クリア"),
    )
  );
  const table = el("table",{class:"table",id:"hisTable"},
    el("thead",{}, el("tr",{}, el("th",{},"日時"), el("th",{},"モード"), el("th",{},"名前"), el("th",{},"要約"), el("th",{},"操作"))),
    el("tbody",{})
  );
  sec.append(tools, table);
  root.appendChild(sec);
}
function renderSettings(root){
  const sec = el("section",{class:"section"});
  sec.appendChild(el("h2",{},"設定 / 連携"));
  const grid = el("div",{class:"grid"});
  const setCat = CATEGORY_META.find(c=>c.key==="settings");
  setCat.fields.forEach(f=> grid.appendChild(renderField(f)));
  grid.appendChild(el("div",{class:"grid-full"},
    el("button",{id:"btnSaveSettings",class:"btn"},"設定を保存"),
    el("button",{id:"btnTestGAS",class:"btn ghost",style:"margin-left:8px"},"GAS接続テスト")
  ));
  sec.appendChild(grid);
  root.appendChild(sec);
}

/* ---------- スキーマ→入力要素 ---------- */
function renderField(f){
  const wrap = el("div",{},);
  if (f.type==="preset"){
    wrap.append(
      el("div",{class:"label"},"プリセット（キャラ統一時のみ）"),
      el("div",{class:"row wrap-inline gap8"},
        el("button",{id:"btnPresetSave",class:"btn small"},"保存"),
        el("button",{id:"btnPresetPick",class:"btn small"},"選択"),
        el("button",{id:"btnPresetDel",class:"btn small danger"},"削除"),
      )
    );
    return wrap;
  }
  if (f.label) wrap.appendChild(el("div",{class:"label"}, f.label));
  switch(f.type){
    case "text":
      return el("div",{}, f.label?el("div",{class:"label"},f.label):null, el("input",{class:"input",id:`fld_${f.key}`,type:"text",placeholder:f.placeholder||""}));
    case "number":
      return el("div",{}, f.label?el("div",{class:"label"},f.label):null, el("input",{class:"input",id:`fld_${f.key}`,type:"number",placeholder:f.placeholder||""}));
    case "textarea":
      return el("div",{}, f.label?el("div",{class:"label"},f.label):null, el("textarea",{class:"textarea",id:`fld_${f.key}`,placeholder:f.placeholder||""}));
    case "toggle":
      return el("div",{}, el("label",{class:"radio"}, el("input",{id:`fld_${f.key}`,type:"checkbox"}), "有効にする"));
    case "radio":
      return el("div",{}, ...(f.label?[el("div",{class:"label"},f.label)]:[]),
        ...f.options.map(([val,lab])=> el("label",{class:"radio"}, el("input",{type:"radio",name:`fld_${f.key}`,value:val}), lab)));
    case "checkbox":
      return el("div",{}, ...(f.label?[el("div",{class:"label"},f.label)]:[]),
        el("div",{class:"chips"},
          ...f.options.map(lab=> el("label",{class:"chip"}, el("input",{type:"checkbox",name:`fld_${f.key}`,value:lab}), lab))));
    case "radio+free":
      return el("div",{}, ...(f.label?[el("div",{class:"label"},f.label)]:[]),
        el("div",{class:"chips"},
          ...f.options.map(lab=> el("label",{class:"chip"}, el("input",{type:"radio",name:`fld_${f.key}`,value:lab}), lab))),
        el("input",{class:"input",id:`fld_${f.key}_free`,type:"text",placeholder:"自由入力（上のどれでもない場合）"}));
    case "checkbox+free":
      return el("div",{}, ...(f.label?[el("div",{class:"label"},f.label)]:[]),
        el("div",{class:"chips"},
          ...f.options.map(lab=> el("label",{class:"chip"}, el("input",{type:"checkbox",name:`fld_${f.key}`,value:lab}), lab))),
        el("input",{class:"input",id:`fld_${f.key}_free`,type:"text",placeholder:"追加タグ（カンマ区切り可）"}));
    default:
      return wrap;
  }
}

/* ---------- イベント結線 ---------- */
function wireGlobalButtons(){
  $("#btnGenerate").addEventListener("click", onGenerate);
  $("#btnCopyShown").addEventListener("click", copyShown);
  $("#btnCopyAll").addEventListener("click", copyAll);
  $("#btnExport").addEventListener("click", onExport);
  $("#btnImportJson").addEventListener("click", onImportJson);
  $("#btnImportSheet").addEventListener("click", onImportSheet);

  $("#btnSaveSettings").addEventListener("click", saveSettings);
  $("#btnTestGAS").addEventListener("click", testGAS);

  $("#btnHisRefresh").addEventListener("click", renderHistoryRows);
  $("#btnHisClear").addEventListener("click", clearHistory);

  $("#btnPresetSave")?.addEventListener("click", presetSave);
  $("#btnPresetPick")?.addEventListener("click", presetPick);
  $("#btnPresetDel")?.addEventListener("click", presetDelete);

  $("#hisSearch").addEventListener("input", renderHistoryRows);
}
function onModeChange(e){ state.mode = e.target.value; }
function onPlatformChange(e){ state.platform = e.target.value; }

/* ---------- 値の収集 & 反映 ---------- */
function getRadioValue(name){
  const x = $(`input[name="${name}"]:checked`);
  return x ? x.value : "";
}
function getCheckValues(name){
  return $$(`input[name="${name}"]:checked`).map(i=>i.value);
}
function collectSelections(){
  // character
  const name = $("#fld_name")?.value?.trim() || "";
  const age  = $("#fld_age")?.value?.trim() || "";
  const gender = getRadioValue("fld_gender") || "girl";

  // hair
  const hairColor = getRadioValue("fld_hairColor") || $("#fld_hairColor_free")?.value?.trim() || "";
  const hairTone  = getRadioValue("fld_hairTone") || "normal";
  const hairstyle = getRadioValue("fld_hairstyle") || $("#fld_hairstyle_free")?.value?.trim() || "";
  const hairEmph  = getRadioValue("fld_hairEmph") || "normal";

  // face
  const eyeColor = getRadioValue("fld_eyeColor") || $("#fld_eyeColor_free")?.value?.trim() || "";
  const expression = [
    ...getCheckValues("fld_expression"),
    ...($("#fld_expression_free")?.value?.split(",").map(s=>s.trim()).filter(Boolean)||[])
  ];

  // outfit
  const clothing = getRadioValue("fld_clothing") || $("#fld_clothing_free")?.value?.trim() || "";
  const accessories = getCheckValues("fld_accessories");

  // layout
  const faceAngle = getRadioValue("fld_faceAngle");
  const gaze = getRadioValue("fld_gaze");
  const shot = getRadioValue("fld_shot");
  const background = getRadioValue("fld_background") || $("#fld_background_free")?.value?.trim() || "";
  const timeOfDay = getRadioValue("fld_timeOfDay");
  const weather = getRadioValue("fld_weather");
  const lighting = getRadioValue("fld_lighting");
  const colorTone = getRadioValue("fld_colorTone");
  const pose = getRadioValue("fld_pose") || $("#fld_pose_free")?.value?.trim() || "";
  const customTags = ($("#fld_customTags")?.value||"").split(",").map(s=>s.trim()).filter(Boolean);

  // assist
  const negative = ($("#fld_negative")?.value?.trim()) || "";

  const lora = [
    ...getCheckValues("fld_lora"),
    ...($("#fld_lora_free")?.value?.split(",").map(s=>s.trim()).filter(Boolean)||[])
  ];
  const control = [
    ...getCheckValues("fld_control"),
    ...($("#fld_control_free")?.value?.split(",").map(s=>s.trim()).filter(Boolean)||[])
  ];

  return {
    name, age, gender,
    hairColor, hairTone, hairstyle, hairEmph,
    eyeColor, expression,
    clothing, accessories,
    faceAngle, gaze, shot, background, timeOfDay, weather, lighting, colorTone, pose,
    customTags, negative, lora, control
  };
}
function applySnapshot(snap){
  // モード
  if (snap.mode) {
    state.mode = snap.mode;
    $$('input[name="mode"]').forEach(i=> i.checked = (i.value===snap.mode));
  }
  // プラットフォーム
  if (snap.settings?.platform || snap.platform){
    const p = snap.platform || snap.settings.platform;
    state.platform = p;
    $$('input[name="platform"]').forEach(i=> i.checked = (i.value===p));
  }
  // 基本と選択（日本語ラベルベース）
  const setRadio = (name, val)=> {
    if(!val) return;
    const r = $$(`input[name="fld_${name}"]`);
    let matched = false;
    r.forEach(i=>{ if(i.value===val){ i.checked=true; matched=true; }});
    if(!matched && $(`#fld_${name}_free`)) $(`#fld_${name}_free`).value = val;
  };
  const setCheckMulti = (name, arr)=>{
    if(!arr||!arr.length) return;
    $$(`input[name="fld_${name}"]`).forEach(i=> i.checked = arr.includes(i.value));
    const extras = arr.filter(v=> !$$(`input[name="fld_${name}"]`).some(i=>i.value===v));
    if (extras.length && $(`#fld_${name}_free`)) $(`#fld_${name}_free`).value = extras.join(", ");
  };

  $("#fld_name") && ($("#fld_name").value = snap.name||"");
  $("#fld_age")  && ($("#fld_age").value  = snap.age||"");

  setRadio("gender", snap.gender);

  setRadio("hairColor", snap.hairColor);
  setRadio("hairTone", snap.hairTone);
  setRadio("hairstyle", snap.hairstyle);
  setRadio("hairEmph", snap.hairEmph);

  setRadio("eyeColor", snap.eyeColor);
  setCheckMulti("expression", snap.expression||[]);

  setRadio("clothing", snap.clothing);
  setCheckMulti("accessories", snap.accessories||[]);

  setRadio("faceAngle", snap.faceAngle);
  setRadio("gaze", snap.gaze);
  setRadio("shot", snap.shot);
  setRadio("background", snap.background);
  setRadio("timeOfDay", snap.timeOfDay);
  setRadio("weather", snap.weather);
  setRadio("lighting", snap.lighting);
  setRadio("colorTone", snap.colorTone);
  setRadio("pose", snap.pose);

  if (Array.isArray(snap.customTags)) $("#fld_customTags").value = snap.customTags.join(", ");
  $("#fld_negative") && ($("#fld_negative").value = snap.negative||"");

  // 設定
  if (snap.settings){
    const st = snap.settings;
    if (st.mj_ar) $("#fld_mj_ar").value = st.mj_ar;
    if (st.mj_v) $("#fld_mj_v").value = st.mj_v;
    if (st.sd_weight != null) $("#fld_sd_weight").value = st.sd_weight;
    if (st.negative_default != null) $("#fld_negative_default").value = st.negative_default;
    if (st.gas_url) $("#fld_gas_url").value = st.gas_url;
    if (st.gas_token) $("#fld_gas_token").value = st.gas_token;
    $("#fld_sheet_enabled").checked = !!st.sheet_enabled;
  }

  state.negative = snap.negative || "";
  refreshAll();
  toast("インポートして復元しました");
}

/* ---------- 生成 ---------- */
function translateToken(dict, ja){
  if (!ja) return "";
  return dict[ja] || ja; // 未知語はそのまま
}
function buildPrompts(){
  const s = collectSelections();

  // 英語化
  const hairColorEn = (s.hairTone==="light" ? "light " : s.hairTone==="dark" ? "dark " : "") + (translateToken(DICT.hairColor, s.hairColor) || s.hairColor || "");
  const hairStyleEn = translateToken(DICT.hairstyle, s.hairstyle) || s.hairstyle || "";
  const eyeColorEn  = translateToken(DICT.eyeColor, s.eyeColor) || s.eyeColor || "";
  const exprEn      = (s.expression||[]).map(x=> translateToken(DICT.expression, x)||x);
  const clothingEn  = translateToken(DICT.clothing, s.clothing) || s.clothing || "";
  const accEn       = (s.accessories||[]).map(x=> translateToken(DICT.accessories,x)||x);

  const faceAngleEn = translateToken(DICT.faceAngle, s.faceAngle)||s.faceAngle||"";
  const gazeEn      = translateToken(DICT.gaze, s.gaze)||s.gaze||"";
  const shotEn      = translateToken(DICT.shot, s.shot)||s.shot||"";
  const bgEn        = translateToken(DICT.background, s.background)||s.background||"";
  const timeEn      = translateToken(DICT.timeOfDay, s.timeOfDay)||s.timeOfDay||"";
  const weatherEn   = translateToken(DICT.weather, s.weather)||s.weather||"";
  const lightEn     = translateToken(DICT.lighting, s.lighting)||s.lighting||"";
  const toneEn      = translateToken(DICT.colorTone, s.colorTone)||s.colorTone||"";
  const poseEn      = translateToken(DICT.pose, s.pose)||s.pose||"";

  // 誰？（名前はプロンプトに入れない）
  const who = (()=> {
    const g = s.gender || "girl";
    const age = parseInt(s.age||"",10);
    if (!isNaN(age)){
      if (age <= 12) return `child ${g==="boy"?"boy":"girl"}`;
      if (age <= 17) return `teenage ${g==="boy"?"boy":"girl"}`;
    }
    return g==="boy"?"young man":"young woman";
  })();

  // 並び順対応マップ
  const partsMap = {
    who: [who],
    hairPrimary: [ hairColorEn && `${hairColorEn}` ],
    hairStyle: [
      hairStyleEn && `${hairStyleEn} hair`,
      s.hairEmph==="strong" ? "well-defined hairstyle"
      : s.hairEmph==="soft" ? "soft hairstyle" : ""
    ],
    eyes: [ eyeColorEn && `${eyeColorEn} eyes` ],
    expression: exprEn,
    clothing: [ clothingEn ],
    accessories: accEn,
    pose: [ poseEn ],
    faceAngle: [ faceAngleEn ],
    gaze: [ gazeEn ],
    shot: [ shotEn ],
    background: [ bgEn ],
    timeOfDay: [ timeEn ],
    weather: [ weatherEn ],
    lighting: [ lightEn ],
    colorTone: [ toneEn ],
    customTags: (s.customTags||[])
  };

  const general = assembleParts(partsMap).join(", ");

  // SD（重み補正）
  let hairW = Number($("#fld_sd_weight")?.value || state.settings.sd_weight || 1.2);
  if (s.hairEmph==="soft") hairW = hairW - 0.15;
  if (s.hairEmph==="strong") hairW = hairW + 0.15;
  const sd = `${general}, (hairstyle:${hairW.toFixed(2)})\nNegative: ${s.negative || $("#fld_negative_default")?.value || state.settings.negative_default}`;

  // MJ
  const mj = `${general} --ar ${$("#fld_mj_ar")?.value || state.settings.mj_ar} --v ${$("#fld_mj_v")?.value || state.settings.mj_v}`;

  // DALL·E
  const dalle = `A clean illustration of ${general}, high detail, clean linework.`;

  return { general, sd, mj, dalle };
}

function onGenerate(){
  // 必須チェック
  if (state.mode==="character"){
    const nm = $("#fld_name")?.value?.trim();
    if (!nm){ toast("キャラ統一モード：キャラ名は必須です"); return; }
  }
  const must = ["hairstyle","hairColor","eyeColor","clothing","faceAngle","gaze","background"];
  const miss = must.filter(k=>{
    const r = getRadioValue(`fld_${k}`);
    const free = $(`#fld_${k}_free`)?.value?.trim();
    return !(r || free);
  });
  if (miss.length){
    toast("必須未入力: " + miss.join(", "));
    return;
  }

  const p = buildPrompts();
  $("#out_general").textContent = p.general;
  $("#out_sd").textContent = p.sd;
  $("#out_mj").textContent = p.mj;
  $("#out_dalle").textContent = p.dalle;

  addHistory(p);
  toast("生成しました");
}
function copyShown(){
  const plat = state.platform;
  const map = {general:"#out_general", sd:"#out_sd", mj:"#out_mj", dalle:"#out_dalle"};
  const txt = $(map[plat]).textContent || "";
  navigator.clipboard.writeText(txt).then(()=> toast("表示中の出力をコピーしました"));
}
function copyAll(){
  const all = ["#out_general","#out_sd","#out_mj","#out_dalle"].map(sel=>{
    const label = sel.includes("general")?"[General]":sel.includes("sd")?"[SD]":sel.includes("mj")?"[MJ]":"[DALL·E]";
    return `${label}\n${$(sel).textContent}\n`;
  }).join("\n");
  navigator.clipboard.writeText(all).then(()=> toast("全部コピーしました"));
}

/* ---------- スナップショット ---------- */
function snapshot(){
  const sel = collectSelections();
  const prompts = buildPrompts();
  const s = {
    version:"1.0",
    mode: state.mode,
    platform: state.platform,
    name: sel.name, // 管理用（本文には入れない）
    age: sel.age?Number(sel.age):undefined,
    gender: sel.gender,
    hairTone: sel.hairTone,
    hairEmph: sel.hairEmph,
    selections: {
      hairColor: sel.hairColor? [sel.hairColor]: [],
      hairstyle: sel.hairstyle? [sel.hairstyle]: [],
      eyeColor:  sel.eyeColor? [sel.eyeColor]: [],
      expression: sel.expression||[],
      clothing: sel.clothing? [sel.clothing]: [],
      accessories: sel.accessories||[],
      faceAngle: sel.faceAngle? [sel.faceAngle]: [],
      gaze: sel.gaze? [sel.gaze]: [],
      shot: sel.shot? [sel.shot]: [],
      background: sel.background? [sel.background]: [],
      timeOfDay: sel.timeOfDay? [sel.timeOfDay]: [],
      weather: sel.weather? [sel.weather]: [],
      lighting: sel.lighting? [sel.lighting]: [],
      colorTone: sel.colorTone? [sel.colorTone]: [],
      pose: sel.pose? [sel.pose]: []
    },
    customTags: sel.customTags||[],
    negative: sel.negative || ($("#fld_negative_default")?.value || state.settings.negative_default),
    settings: {
      mj_ar: $("#fld_mj_ar")?.value || state.settings.mj_ar,
      mj_v:  $("#fld_mj_v")?.value || state.settings.mj_v,
      sd_weight: Number($("#fld_sd_weight")?.value || state.settings.sd_weight),
      negative_default: $("#fld_negative_default")?.value || state.settings.negative_default,
      gas_url: $("#fld_gas_url")?.value || state.settings.gas_url,
      gas_token: $("#fld_gas_token")?.value || state.settings.gas_token,
      sheet_enabled: $("#fld_sheet_enabled")?.checked || false,
      platform: state.platform
    },
    prompts,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    record_id: String(Date.now())
  };
  return s;
}
function applySnapshotCompat(s){ applySnapshot(s); }

/* ---------- 履歴 ---------- */
function addHistory(prompts){
  const s = snapshot();
  const entry = {
    record_id: s.record_id,
    mode: s.mode,
    name: s.name || "",
    summary: s.prompts.general.slice(0,120),
    created_at: s.created_at,
    snap: s
  };
  state.history.unshift(entry);
  saveHistory();
  renderHistoryRows();
}
function renderHistoryRows(){
  const kw = $("#hisSearch").value.trim().toLowerCase();
  const tbody = $("#hisTable tbody"); tbody.innerHTML = "";
  state.history
    .filter(h=>{
      if (!kw) return true;
      return [h.name, h.mode, h.summary].join(" ").toLowerCase().includes(kw);
    })
    .forEach(h=>{
      const tr = el("tr",{},
        el("td",{}, new Date(h.created_at).toLocaleString()),
        el("td",{}, h.mode),
        el("td",{}, h.name || "-"),
        el("td",{}, el("span",{class:"muted"}, h.summary)),
        el("td",{},
          el("button",{class:"btn small",onclick:()=>{ applySnapshotCompat(h.snap); showPrompts(buildPrompts()); }},"プレビュー"),
          " ",
          el("button",{class:"btn small",onclick:()=> exportJSON(h.snap)},"JSON"),
          " ",
          el("button",{class:"btn small danger",onclick:()=>{ state.history = state.history.filter(x=>x!==h); saveHistory(); renderHistoryRows(); }},"削除")
        )
      );
      tbody.appendChild(tr);
    });
}
function showPrompts(p){
  $("#out_general").textContent = p.general;
  $("#out_sd").textContent = p.sd;
  $("#out_mj").textContent = p.mj;
  $("#out_dalle").textContent = p.dalle;
}
function clearHistory(){
  if (!confirm("履歴をすべて削除します。よろしいですか？")) return;
  state.history = [];
  saveHistory();
  renderHistoryRows();
}

/* ---------- 設定保存 / 読込 ---------- */
function saveSettings(){
  state.settings.mj_ar = $("#fld_mj_ar")?.value || state.settings.mj_ar;
  state.settings.mj_v  = $("#fld_mj_v")?.value || state.settings.mj_v;
  state.settings.sd_weight = Number($("#fld_sd_weight")?.value || state.settings.sd_weight);
  state.settings.negative_default = $("#fld_negative_default")?.value || state.settings.negative_default;
  state.settings.gas_url = $("#fld_gas_url")?.value || "";
  state.settings.gas_token = $("#fld_gas_token")?.value || "";
  state.settings.sheet_enabled = $("#fld_sheet_enabled")?.checked || false;
  localStorage.setItem(KEY_SETTINGS, JSON.stringify(state.settings));
  toast("設定を保存しました");
}
function loadFromStorage(){
  try{
    const s = JSON.parse(localStorage.getItem(KEY_SETTINGS)||"null");
    if (s) Object.assign(state.settings, s);
    const h = JSON.parse(localStorage.getItem(KEY_HISTORY)||"[]");
    state.history = h;
    const p = JSON.parse(localStorage.getItem(KEY_PRESETS)||"{}");
    state.presets = p;
  }catch(e){}
  $("#fld_mj_ar").value = state.settings.mj_ar;
  $("#fld_mj_v").value  = state.settings.mj_v;
  $("#fld_sd_weight").value = state.settings.sd_weight;
  $("#fld_negative_default").value = state.settings.negative_default;
  $("#fld_gas_url").value = state.settings.gas_url;
  $("#fld_gas_token").value = state.settings.gas_token;
  $("#fld_sheet_enabled").checked = !!state.settings.sheet_enabled;
  renderHistoryRows();
}
function saveHistory(){
  localStorage.setItem(KEY_HISTORY, JSON.stringify(state.history));
}

/* ---------- プリセット（キャラ統一） ---------- */
function presetSave(){
  const nm = $("#fld_name")?.value?.trim();
  if (!nm){ toast("キャラ名を入力してください"); return; }
  const snap = snapshot();
  state.presets[nm] = snap;
  localStorage.setItem(KEY_PRESETS, JSON.stringify(state.presets));
  toast("プリセットを保存しました");
}
function presetPick(){
  const names = Object.keys(state.presets);
  if (!names.length){ toast("プリセットがありません"); return; }
  const list = el("div",{},
    el("div",{class:"modal-head"}, el("h3",{},"プリセットを選択"), el("button",{class:"btn small ghost",onclick:closeModal},"閉じる")),
    el("div",{class:"modal-body"},
      ...names.map(n=> el("div",{class:"row space-between",style:"border-bottom:1px solid #eee;padding:8px 0"},
        el("div",{}, n),
        el("button",{class:"btn small",onclick:()=>{ applySnapshotCompat(state.presets[n]); closeModal(); }},"読み込む")
      ))
    )
  );
  openModal(list);
}
function presetDelete(){
  const nm = $("#fld_name")?.value?.trim();
  if (!nm){ toast("削除するキャラ名を入力してください"); return; }
  if (!state.presets[nm]){ toast("その名前のプリセットはありません"); return; }
  delete state.presets[nm];
  localStorage.setItem(KEY_PRESETS, JSON.stringify(state.presets));
  toast("プリセットを削除しました");
}

/* ---------- エクスポート ---------- */
function onExport(){
  const s = snapshot();
  const body = el("div",{},
    el("div",{class:"modal-head"}, el("h3",{},"エクスポート"), el("button",{class:"btn small ghost",onclick:closeModal},"閉じる")),
    el("div",{class:"modal-body"},
      el("p",{},"保存先を選んでください。"),
      el("div",{class:"row gap8 wrap-inline"},
        el("button",{class:"btn",onclick:()=>{ exportJSON(s); closeModal(); }},"JSONのみ"),
        el("button",{class:"btn",onclick:()=>{ exportSheet(s); closeModal(); }},"スプレッドシートのみ"),
        el("button",{class:"btn",onclick:async()=>{ await exportJSON(s); await exportSheet(s); closeModal(); }},"両方")
      )
    ),
    el("div",{class:"modal-foot"}, el("button",{class:"btn ghost",onclick:closeModal},"キャンセル"))
  );
  openModal(body);
}
function exportJSON(s){
  return new Promise(resolve=>{
    const blob = new Blob([JSON.stringify(s,null,2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const safe = (s.name||"character").replace(/[\\/:*?"<>|]/g,"_");
    a.download = `prompt_${safe}_${s.record_id}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
    toast("JSONを書き出しました");
    resolve();
  });
}
async function exportSheet(s){
  const url = $("#fld_gas_url").value.trim();
  if (!url){ toast("GAS Web App URLを設定してください"); return; }
  const token = $("#fld_gas_token").value.trim();

  const params = new URLSearchParams({
    token,
    name: s.name || "",
    mode: s.mode,
    general: s.prompts.general || "",
    sd: s.prompts.sd || "",
    mj: s.prompts.mj || "",
    dalle: s.prompts.dalle || "",
    tags: (s.customTags||[]).join(", "),
    note: "",
    negative: s.negative || "",
    selections_json: JSON.stringify(s.selections),
    settings_json: JSON.stringify(s.settings),
    record_id: s.record_id
  });

  try{
    const res = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/x-www-form-urlencoded" }, body: params.toString()});
    const js = await res.json().catch(()=> ({}));
    if (!res.ok || !js.ok){ throw new Error(js.error||`HTTP ${res.status}`); }
    toast("スプレッドシートに保存しました");
  }catch(e){
    console.error(e);
    toast("シート保存に失敗: " + e.message);
  }
}

/* ---------- インポート（JSON / Sheet） ---------- */
function onImportJson(){
  const inp = el("input",{type:"file",accept:"application/json",style:"display:none"});
  inp.addEventListener("change", e=>{
    const f = e.target.files?.[0]; if(!f) return;
    const r = new FileReader();
    r.onload = ()=> {
      try{
        const json = JSON.parse(r.result);
        applySnapshotCompat(json);
      }catch(err){ toast("JSONの読み込みに失敗しました"); }
    };
    r.readAsText(f);
  });
  document.body.appendChild(inp);
  inp.click();
  setTimeout(()=> inp.remove(), 0);
}
async function onImportSheet(){
  const url = $("#fld_gas_url").value.trim();
  if (!url){ toast("GAS Web App URLを設定してください"); return; }
  const token = $("#fld_gas_token").value.trim();
  const q = new URLSearchParams({ token, limit: 50 });
  try{
    const res = await fetch(`${url}?${q.toString()}`);
    const js = await res.json();
    if (!res.ok || !js.ok) throw new Error(js.error||`HTTP ${res.status}`);
    showSheetPicker(js.items||[]);
  }catch(e){
    console.error(e);
    toast("シートから取得に失敗: " + e.message);
  }
}
function showSheetPicker(items){
  const list = el("div",{},
    el("div",{class:"modal-head"}, el("h3",{},"シートからインポート"), el("button",{class:"btn small ghost",onclick:closeModal},"閉じる")),
    el("div",{class:"modal-body"},
      ...items.map(it=>{
        const head = `${new Date(it.date).toLocaleString()} / ${it.name||"-"}`;
        const sum  = (it.general||"").slice(0,140);
        return el("div",{style:"border-bottom:1px solid #eaeef3;padding:10px 0"},
          el("div",{}, el("b",{}, head)),
          el("div",{class:"muted"}, sum),
          el("div",{class:"row gap8",style:"margin-top:6px"},
            el("button",{class:"btn small",onclick:()=>{
              try{
                const snap = {
                  version:"1.0",
                  mode: it.mode || "single",
                  name: it.name || "",
                  platform: "general",
                  selections: JSON.parse(it.selections_json||"{}"),
                  customTags: (it.tags||"").split(",").map(s=>s.trim()).filter(Boolean),
                  negative: it.negative || "",
                  settings: JSON.parse(it.settings_json||"{}"),
                  prompts: { general: it.general||"", sd: it.sd||"", mj: it.mj||"", dalle: it.dalle||"" },
                  created_at: new Date(it.date).toISOString(),
                  updated_at: new Date().toISOString(),
                  record_id: it.record_id || String(Date.now())
                };
                applySnapshotCompat(snap);
                closeModal();
              }catch(e){
                console.error(e);
                toast("行のJSONが壊れている可能性があります");
              }
            }},"読み込む")
          )
        );
      })
    ),
    el("div",{class:"modal-foot"}, el("button",{class:"btn ghost",onclick:closeModal},"閉じる"))
  );
  openModal(list);
}

/* ---------- GAS接続テスト（ok:true まで検証） ---------- */
async function testGAS(){
  const baseUrl = $("#fld_gas_url").value.trim();
  const token   = $("#fld_gas_token").value.trim();
  if (!baseUrl){ toast("GAS Web App URLを設定してください"); return; }

  // ?limit=1 に token（あれば）を付けて GET
  const qs = new URLSearchParams({ limit: "1" });
  if (token) qs.set("token", token);

  let res, data;
  try{
    res  = await fetch(`${baseUrl}?${qs.toString()}`);
    data = await res.json().catch(()=> ({}));
  }catch(err){
    console.error(err);
    toast("接続テスト失敗: ネットワークエラー");
    return;
  }

  // 200 でも ok:false ならエラー扱いにする
  if (res.ok && data && data.ok === true){
    toast("GAS接続OK（認証も成功）");
  }else{
    const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
    // トークン不一致などもここでNGにする
    toast(`GAS接続NG: ${msg}`);
  }
}

/* ---------- 画面再描画 ---------- */
function refreshAll(){ /* 必要ならここに反映系を追加 */ }

/* ---------- 起動 ---------- */
document.addEventListener("DOMContentLoaded", mount);
