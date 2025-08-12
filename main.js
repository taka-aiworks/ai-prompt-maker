<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>AIキャラ統一プロンプトメーカー</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <header class="app-header">
    <div class="wrap">
      <h1>AIキャラ統一プロンプトメーカー</h1>
      <p class="sub">日本語で選んで英語プロンプトを自動生成。JSON / スプレッドシート 両対応。</p>
    </div>
  </header>

  <!-- JSが全UIを描画するマウントポイント -->
  <main id="app" class="app wrap" aria-live="polite"></main>

  <!-- モーダル（JSで中身を差し込む） -->
  <div id="modal-root" class="modal-root" aria-hidden="true"></div>

  <!-- トースト置き場 -->
  <div id="toast-root" class="toast-root" aria-live="assertive" aria-atomic="true"></div>

  <footer class="app-footer">
    <div class="wrap">
      <small>&copy; 2025 Prompt Maker</small>
    </div>
  </footer>

  <script src="main.js"></script>
</body>
</html>
