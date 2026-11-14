# NIGHT SLUGGER 夜間強打者

一款專為手機與桌面瀏覽器設計的節奏打擊小遊戲。抓準投球進壘的瞬間揮棒，在 9 球內挑戰最高分。

這不是標準棒球局數模擬；每局固定只有 **9 球**，重點是反應速度與揮棒時機。

## 遊戲玩法

1. 按下「開始挑戰」後，投手會依序投出 9 球。
2. 手機可點擊球場或「揮棒」按鈕；桌面瀏覽器也可按 **空白鍵** 揮棒。
3. 越接近最佳擊球點，得分越高：

| 判定 | 得分 |
| --- | ---: |
| Perfect | 500 |
| Great | 200 |
| Contact | 100 |
| Miss | 0 |

4. 9 球結束後會顯示本局總分；可使用「再打一局」立即重新開始。途中也能按「重新開始」重設本局。
5. 最高分保存在本機瀏覽器。右上角可開關音效；切換到其他分頁後會暫停，回來按「繼續比賽」，當球重新投出且不扣球數。

## 本機執行

需要 Node.js；專案不使用任何第三方套件，因此不必先安裝相依套件。

```bash
npm run start
```

接著開啟 [http://localhost:4173](http://localhost:4173)。

若環境只提供 Node.js、沒有 npm，也可直接執行 `node server.mjs`；不要直接以 `file://` 開啟 HTML，瀏覽器會阻擋 ES 模組。

執行自動測試：

```bash
npm test
```

沒有 npm 時可執行 `node --test tests/engine.test.js`。這些測試涵蓋擊球時機邊界、不同球速、九球結算與重設。

## 部署到 GitHub Pages

專案已附上 `.github/workflows/deploy-pages.yml`。工作流程會直接上傳 `site/` 目錄，因此部署 artifact 的最上層會包含 `index.html`。

1. 在 GitHub 建立儲存庫，將本專案推送至 `main` 分支。
2. 前往儲存庫的 **Settings → Pages**。
3. 在 **Build and deployment** 的 **Source** 選擇 **GitHub Actions**。
4. 重新推送至 `main`，或在 **Actions** 頁面手動執行「Deploy to GitHub Pages」。
5. 部署完成後，可在工作流程摘要或 **Settings → Pages** 找到網站網址。

請不要選擇從 `main` 根目錄直接發布；專案根目錄沒有 `index.html`，網站檔案位於 `site/`，應使用隨附的 GitHub Actions 工作流程。

## 專案結構

```text
site/
├── index.html
├── styles.css
├── app.js
├── engine.js
└── favicon.svg
```

所有網站資源皆為本地靜態檔案，不需要後端服務或外部 CDN。

GitHub 官方操作說明：[設定 Pages 發布來源](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。
