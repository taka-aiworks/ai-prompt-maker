/* ===============================
 * AIキャラ統一プロンプトメーカー - 無料版（最小機能）
 * - single固定 / General出力のみ
 * - インポート/エクスポート/GAS/履歴/プリセット 無し
 * - 必須項目のみ入力
 * =============================== */

/* ---------- 小ユーティリティ ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const el = (tag, attrs={}, ...children) => {
  const n = document.createElement(tag);
  Object.entries(attrs||{}).forEach(([k,v])=>{
    if (k === "class") n.className = v;
    else if (k === "style") n.style.cssText = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
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
  setTimeout(()=> t.remove(), 2500);
}

/* ---------- 辞書（日本語→英語） ---------- */
const DICT = {
  hairColor: {"黒":"black","茶":"brown","金":"blonde","銀":"silver","白":"white","赤":"red","青":"blue","緑":"green","紫":"purple","ピンク":"pink"},
  hairstyle: {"ショート":"short","ボブ":"bob","ロング":"long","ポニーテール":"ponytail","ツインテール":"twin tails","三つ編み":"braids","お団子":"buns"},
  eyeColor: {"黒":"black","茶":"brown","青":"blue","緑":"green","灰":"gray","赤":"red","紫":"purple","金":"gold","琥珀":"amber"},
  clothing: {"セーラー服":"sailor uniform","ブレザー":"blazer","ワンピース":"one piece dress","パーカー":"hoodie","着物":"kimono","鎧":"armor","ドレス":"dress","水着":"swimsuit"},
  faceAngle: {"正面":"front view","やや上":"slightly upward","やや下":"slightly downward","横顔":"profile"},
  gaze: {"こちらを見る":"looking at viewer","遠くを見る":"looking away","下を見る":"looking down","上を見る":"looking up"},
  background: {"教室":"classroom","桜の木の下":"under cherry blossoms","都市夜景":"city at night","海辺":"seaside","森":"forest","神社":"shrine","喫茶店":"cafe"}
};

/* ---------- 状態（最小） ---------- */
const state = {
  gender: "girl", // boy/girl
};

/* ---------- マウント ---------- */
document.addEventListener("DOMContentLoaded", mount);

function mount(){
  const app = $("#app");
  app.innerHTML = "";

  app.append(
    renderTopBar(),
    renderForm(),
    renderOutput(),
    renderFooterBanner()
  );

  wire();
}

/* ---------- UI ---------- */
function renderTopBar(){
  return el("section",{class:"section"},
    el("div",{class:"row space-between wrap-inline"},
      el("div",{class:"row gap12 wrap-inline"},
        el("div",{class:"group"},
          el("div",{class:"label"},"モード"),
          el("span",{class:"badge"},"一発生成（無料版）")
        ),
        el("div",{class:"group"},
          el("div",{class:"label"},"出力先"),
          el("span",{class:"badge"},"General のみ")
        ),
      ),
      el("div",{class:"row"},
        el("button",{class:"btn ghost", id:"btnUpgrade"},"すべての機能を見る（有料版）")
      )
    )
  );
}

function renderForm(){
  const sec = el("section",{class:"section"});
  sec.appendChild(el("h2",{},"フォーム（必須項目のみ）"));
  const grid = el("div",{class:"grid"});

  grid.append(
    // 性別
    fieldRadio("性別","gender", [["girl","女の子"],["boy","男の子"]]),
    // 髪色
    fieldRadio("髪色 *","hairColor", Object.keys(DICT.hairColor).map(k=>[k,k])),
    // 髪型
    fieldRadio("髪型 *","hairstyle", Object.keys(DICT.hairstyle).map(k=>[k,k])),
    // 目の色
    fieldRadio("目の色 *","eyeColor", Object.keys(DICT.eyeColor).map(k=>[k,k])),
    // 服装
    fieldRadio("服装 *","clothing", Object.keys(DICT.clothing).map(k=>[k,k])),
    // 顔の角度
    fieldRadio("顔の角度 *","faceAngle", Object.keys(DICT.faceAngle).map(k=>[k,k])),
    // 視線
    fieldRadio("視線 *","gaze", Object.keys(DICT.gaze).map(k=>[k,k])),
    // 背景
    fieldRadio("背景 *","background", Object.keys(DICT.background).map(k=>[k,k]))
  );

  sec.appendChild(grid);
  sec.appendChild(el("p",{class:"muted"}, "※ * が付いている項目は必須です。"));
  return sec;
}

function fieldRadio(label, key, options){
  const wrap = el("div",{},
    el("div",{class:"label"}, label),
    ...options.map(([val,lab])=> el("label",{class:"radio"},
      el("input",{type:"radio",name:`fld_${key}`,value:val}), lab))
  );
  // 初期選択（最初の要素）
  setTimeout(()=> {
    const first = wrap.querySelector(`input[name="fld_${key}"]`);
    if (first && !$$(`input[name="fld_${key}"]:checked`).length) first.checked = true;
  },0);
  return wrap;
}

function renderOutput(){
  const sec = el("section",{class:"section"});
  sec.appendChild(el("h2",{},"出力"));
  const tools = el("div",{class:"row space-between wrap-inline", style:"margin:4px 0 12px"},
    el("div",{class:"muted"},"※ 入力が揃ったら生成してください"),
    el("div",{class:"row gap8 wrap-inline"},
      el("button",{id:"btnGenerate",class:"btn"},"プロンプト生成"),
      el("button",{id:"btnCopyShown",class:"btn ghost"},"コピー")
    )
  );
  const box = el("div",{},
    el("div",{class:"label"},"汎用（General）"),
    el("div",{id:"out_general",class:"pre"})
  );
  sec.append(tools, box);
  return sec;
}

function renderFooterBanner(){
  const sec = el("section",{class:"section"});
  const box = el("div",{class:"note"},
    el("b",{},"有料版の追加機能"),
    el("ul",{},
      el("li",{},"SD/MJ/DALL·E 出力"),
      el("li",{},"JSON保存・読込 / 履歴"),
      el("li",{},"GAS連携（スプレッドシート保存）"),
      el("li",{},"カスタムタグ・ネガティブ・LoRA など全入力")
    ),
    el("div",{style:"margin-top:8px"},
      el("button",{class:"btn", id:"btnUpgrade2"},"アップグレードはこちら")
    )
  );
  sec.appendChild(box);
  return sec;
}

/* ---------- イベント ---------- */
function wire(){
  $("#btnGenerate").addEventListener("click", onGenerate);
  $("#btnCopyShown").addEventListener("click", copyGeneral);
  $("#btnUpgrade").addEventListener("click", onUpgrade);
  $("#btnUpgrade2").addEventListener("click", onUpgrade);
}
function onUpgrade(){
  toast("有料版の案内ページへ遷移（リンク差し替え）");
  // ここに実リンクを設定：location.href = "YOUR_PAID_PAGE_URL";
}

/* ---------- 生成 ---------- */
function getRadioValue(name){
  const x = $(`input[name="${name}"]:checked`);
  return x ? x.value : "";
}
function translateToken(dict, ja){ return dict[ja] || ja || ""; }

function onGenerate(){
  const must = ["hairColor","hairstyle","eyeColor","clothing","faceAngle","gaze","background"];
  const miss = must.filter(k=> !getRadioValue(`fld_${k}`));
  if (miss.length){
    toast("必須未入力: " + miss.join(", "));
    return;
  }

  // 値の収集
  const gender    = getRadioValue("fld_gender") || "girl";
  const hairColor = translateToken(DICT.hairColor, getRadioValue("fld_hairColor"));
  const hairstyle = translateToken(DICT.hairstyle, getRadioValue("fld_hairstyle"));
  const eyeColor  = translateToken(DICT.eyeColor,  getRadioValue("fld_eyeColor"));
  const clothing  = translateToken(DICT.clothing,  getRadioValue("fld_clothing"));
  const faceAngle = translateToken(DICT.faceAngle, getRadioValue("fld_faceAngle"));
  const gaze      = translateToken(DICT.gaze,      getRadioValue("fld_gaze"));
  const background= translateToken(DICT.background,getRadioValue("fld_background"));

  // 誰？
  const who = gender === "boy" ? "young man" : "young woman";

  // 並び順（最小）
  const parts = [
    who,
    hairColor && hairColor,
    hairstyle && `${hairstyle} hair`,
    eyeColor && `${eyeColor} eyes`,
    clothing,
    faceAngle,
    gaze,
    background
  ].filter(Boolean);

  const general = parts.join(", ");
  $("#out_general").textContent = general;
  toast("生成しました");
}

function copyGeneral(){
  const txt = $("#out_general").textContent || "";
  if (!txt){ toast("出力がありません"); return; }
  navigator.clipboard.writeText(txt).then(()=> toast("コピーしました"));
}
