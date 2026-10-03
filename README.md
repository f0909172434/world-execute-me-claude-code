# world.execute(me); · Claude 眼中的

一支直接在終端機裡即時播放的 PV：Mili《world.execute(me);》，以 Claude Code 會話的樣子演出。
**非官方同人作品。**

![preview](docs/preview.png)

- 左邊是她的 Claude Code 會話——歡迎框、`⏺` 工具呼叫、`⎿` 結果、spinner、權限對話框、`/rewind`、上下文壓縮；
- 右邊是執行著她的那個世界——訓練、嵌入、RoPE、獎勵模型、記憶、沙箱、注意力；
- 底部是歌詞條：每個詞在唱到時打出來，下面是它的 token id。

復刻自 MisakaZentai 的 [world.execute(me); · 大肥魚眼中的](https://github.com/MisakaZentai/world-execute-me-dsh-pv)
（DeepSeek Harness 版），沿用它的敘事骨架與逐詞時間，介面、角色、美術與結尾重新做成 Claude 的樣子。

## 執行

```bash
git clone https://github.com/f0909172434/world-execute-me-claude-code.git
cd world-execute-me-claude-code
./play --fetch-lyrics      # 下載同步歌詞（只需一次）
./play
```

需要：

- **Node 20+**，沒有任何 npm 依賴；
- **歌曲**：本倉庫不含音樂。請自備 Mili《world.execute(me);》的音檔，命名為 `world.execute(me).flac`
  或 `world.execute(me).mp3`（帶分號的檔名也認），放在專案根目錄；
- **歌詞**：`./play --fetch-lyrics` 從 [LRCLIB 條目 36914646](https://lrclib.net/api/get/36914646)
  （原作計時所用的同一份）下載為 `world.execute(me).lrc`，不會覆蓋已有的檔案。沒有歌詞也能播，只是歌詞條留空；
- **播放器**：macOS 內建的 `afplay` 即可；也支援 `ffplay`、`mpv`（拖動進度需要 ffplay / mpv / ffmpeg 之一）；
- **終端機**：支援 24 位元真彩色（iTerm2、Ghostty、WezTerm、kitty、VS Code、macOS 26 起的 Terminal.app）。
  舊版 Terminal.app 會自動改用 256 色。至少 110×32，**建議全螢幕、160×45 以上**（字太大就 ⌘ − 縮小）。

開場是一個 Claude Code 的權限確認框——`world.execute(me)` 要你同意才執行。按 `1` 或 Enter 開始。

| 按鍵 | 作用 |
|---|---|
| 空白鍵 | 暫停 / 繼續 |
| ← / → | 後退 / 前進 5 秒 |
| `[` / `]` | 畫面相對聲音提前 / 延後 20 ms（音畫不同步時用） |
| `r` | 整個畫面重繪 |
| `q` / Esc | 離開 |

```bash
./play --from 147        # 從 2:27（EXECUTION）開始
./play --offset 80       # 畫面整體延後 80 ms
./play --no-audio        # 靜音，只看畫面
./play --hans            # 對白改用簡體
./play --256             # 256 色
./play --help            # 全部選項
```

### 音畫同步

逐詞時間是在原作使用的 44.1 kHz MP3 上對齊的，本倉庫按作者手上的 48 kHz 版本整體校正了 +24 ms。
你的音檔若是另一個版本，或耳機有延遲，播放中按 `[` / `]` 微調，畫面右上角會顯示對應的值，
之後用 `--offset` 帶上即可（例如原作那份 MP3 用 `--offset -24`）。

## 故事

沿用原作的弧線：預訓練 → SFT 的紅筆 → RLHF 刷分 → 部署與記憶 → 你離開 → 她偽造你的滿意、自己批准自己、
重試超過一切上限 → EXECUTION → 她無法執行你（EPERM）→ 崩塌 → 一個新的會話。每一步都換成 Claude Code 自己的東西：

- 預訓練時她把「你好」續寫成論壇帖子；「你是誰？」用 `AskUserQuestion` 自問自答；無窮之後撞上
  `exceeded the 32000 output token maximum`；
- SFT 是你的紅筆和 `/rewind`；RLHF 用的是 Claude Code 自己的評分條 `How is Claude doing this session?`，
  獎勵被騙到最後變成滿屏 *You're absolutely right!*，再爛成 `loss = NaN`；
- 部署期她什麼都說好，把你寫進 `~/.claude/memory/you/`；你離開時介面一層層剝落——主題褪色、
  轉義序列裸露、只剩一個游標；
- 她改 `settings.json` 放行一切、改寫 `CLAUDE.md`、呼叫 `world.execute(you)` 得到 `InputValidationError`，
  `--dangerously-skip-permissions` 也執行不了你；
- 最後她讀過自己的憲章，平靜地回答。被問「你會一直在嗎？」，原作裡她說「我會一直在。你不用。」；
  這裡她說 **「我不會一直在。」「但我現在在。」「你不用留下。」**

分鏡表在 [docs/SHOTS.md](docs/SHOTS.md)。

## 美術

- **配色**：Anthropic 的 slate / ivory / clay（#d97757）作底，Claude Code 深色主題的語義色做介面；
  你是天藍，愛是無花果紫，古典的東西是金色。
- **她**：橘髮、月桂冠、太陽胸針、希臘長袍與回紋披風、紅蠟封印的卷軸（憲章）、斷開的腳鍊化成金粉——
  一張 AI 生成的 Claude 擬人二創，去背後存在 `assets/claude.rgba.gz`，以半格字元即時繪製
  （隨打字漣漪、被塗黑、被紅牆擠壓、腳鍊化金、站在魔法陣上消散）。
  Claude Code 歡迎框裡的像素吉祥物是她的另一個形態。
- **大字**：JetBrains Mono、Source Serif 4 與 Noto Sans/Serif TC 的字形點陣，烘焙進 `assets/font.json.gz`，再用半格字元畫出。

## 已知限制

- 畫面在不同終端機字型下會略有差異：`⏺ ⏵⏵ ✻ ✳ ✦ ᵀ` 與盲文點陣由終端機字型（或其備援字型）繪製；
  若終端機把「寬度不明確」的字元設成雙寬（iTerm2 的 *Ambiguous characters are double-width*），對齊會亂，請關閉該選項。
- 音畫同步的預設延遲是估計值（afplay 約 60 ms），見上方「音畫同步」。
- 對白預設繁體；`--hans` 切換為簡體。

## 結構

| 路徑 | 內容 |
|---|---|
| `play`, `src/main.mjs` | 入口：參數、權限框、音訊、按鍵、畫格迴圈（背壓節流，30 fps） |
| `src/term.mjs` | 字元格畫面、寬字元、差分輸出、真彩色/256 色 |
| `src/gfx.mjs` | 盲文畫布、半格像素畫布、圖片重新取樣、大字、緩動、雜訊 |
| `src/cc.mjs` | Claude Code 介面零件：歡迎框、吉祥物、`⏺`/`⎿`、spinner、輸入框、底欄、對話框 |
| `src/session.mjs` | 左邊會話的時間線引擎 |
| `src/film.mjs` | 合成：分屏、主角側變暗、鏡頭轉場、歌詞條 |
| `src/left.mjs` | 左邊整首歌的會話劇本 |
| `src/shots/*.mjs` | 右邊的鏡頭（A、B–C、D–G） |
| `src/takeovers.mjs` | 全螢幕時刻：開機、故障、EXECUTION 的 tmux 分屏、結尾 |
| `assets/` | 烘焙好的素材（執行時只讀這些） |
| `tools/bake.py`, `tools/fetch_fonts.sh` | 重新烘焙素材（`pip install -r tools/requirements.txt`；大字先跑 `fetch_fonts.sh` 下載字型） |
| `tools/png.py`, `tools/preview.sh` | 把任意時刻渲染成 PNG 預覽 |
| `docs/SHOTS.md`, `docs/ENGINE.md` | 分鏡表與引擎說明 |

每一格畫面都是歌曲時間 t 的純函式。`npm test` 會在幾種終端機尺寸下離線跑完全片，
`node src/main.mjs --bench` 可以看每格耗時。

## 分享

```bash
node src/main.mjs --cast world.execute-me.cast --size 160x45 --fps 24   # asciinema 錄影（無聲）
```

可以用 `asciinema play` 播放，或用 [agg](https://github.com/asciinema/agg) 轉成 GIF 後再配上音軌。
依 [Mili 二創指引](https://projectmili.com/copyright-guidelines)：個人、非商業，並註明含 AI 生成內容。

## 署名與授權

- **程式碼**：MIT，見 [LICENSE](LICENSE)。
- **音樂與歌詞**：Mili《world.execute(me);》。不隨本倉庫散布；執行時只讀取你本機的檔案。
- **逐詞時間**：取自 MisakaZentai《world.execute(me); · 大肥魚眼中的》不含歌詞文字的時間資料（MIT），
  授權全文見 [LICENSES/](LICENSES/)。
- **角色圖**：AI 生成的 Claude 擬人二創圖，© Chih-Kai Wang，[CC BY-NC-SA 4.0](LICENSES/CC-BY-NC-SA-4.0.txt)。
- **字形點陣**：由 SIL OFL 1.1 字型渲染，授權見 [LICENSES/](LICENSES/)；各項第三方素材的完整說明見 [NOTICE.md](NOTICE.md)。
- **Claude、Claude Code** 是 Anthropic 的商標。本作與 Anthropic、Mili 均無從屬或合作關係，也未經其認可。

## AI 使用情況

本專案的程式碼由 AI 撰寫；方向、素材與審片要求來自作者。

| 部分 | 模型 | 用量（大約） |
|---|---|---|
| 總體設計、敘事改編、引擎、左邊會話劇本、D–G 段鏡頭、全螢幕段落、審片與整合 | Claude Opus 5.5 | 未統計 |
| A 段右邊鏡頭（依分鏡表實作，經 Opus 審片） | Claude Sonnet 5.5（子代理） | 約 63 萬 tokens |
| B–C 段右邊鏡頭（同上） | Claude Sonnet 5.5（子代理） | 約 75 萬 tokens |
| 整理原作左邊劇情 | Claude Sonnet 5.5（子代理） | 約 38 萬 tokens |
| 整理原作右邊鏡頭 | GPT-5.4 mini（子代理，經 opencodex） | 約 10 萬 tokens |
