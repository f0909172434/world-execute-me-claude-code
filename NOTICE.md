# NOTICE：第三方素材與授權

本倉庫的程式碼依 [LICENSE](LICENSE)（MIT）釋出。下列項目不屬於那份授權，各自保留原本的權利。

## 不在本倉庫裡的

| 項目 | 權利人 | 取得方式 |
|---|---|---|
| 歌曲《world.execute(me);》 | Mili | 自備音檔，放在專案根目錄 |
| 歌詞 | Mili | `./play --fetch-lyrics` 從 LRCLIB（條目 36914646）下載到你的本機，或自備 LRC |

本倉庫的檔案不含任何歌詞文字；歌詞只在播放時從你本機的 LRC 讀取。

## 逐詞時間（MIT）

- **檔案**：`assets/timing.json`、`assets/src/word_timeline_notext.json`
- **來源**：MisakaZentai / [world-execute-me-dsh-pv](https://github.com/MisakaZentai/world-execute-me-dsh-pv)
  的 `data/timing/word_timeline_notext.json`（不含歌詞文字的逐詞時間）。
- **改動**：轉成精簡格式，並對一份 48 kHz 音檔整體校正 +24 ms。
- **授權**：MIT，Copyright (c) 2026 MisakaZentai，全文見
  [LICENSES/MisakaZentai-world-execute-me-dsh-pv-MIT.txt](LICENSES/MisakaZentai-world-execute-me-dsh-pv-MIT.txt)。

## 音訊特徵

- **檔案**：`assets/features.bin.gz`
- **說明**：從歌曲算出的響度、低頻起音、頻譜變化與 8 個頻段的能量包絡（每秒 60 筆、每筆 1 位元組），
  用來讓畫面跟著音樂動。只是包絡數據，無法還原出聲音。

## 角色圖

- **檔案**：`assets/src/claude-girl.webp`，以及由它衍生的 `assets/claude.rgba.gz`（去背、縮放）與 `docs/preview.png` 中她的形象。
- **說明**：AI 生成的 Claude 擬人二創圖，由本倉庫作者提供。**不在 MIT 授權範圍內**；轉用前請先詢問作者。

## 字形點陣

- **檔案**：`assets/font.json.gz`
- **說明**：大字用的字形覆蓋率點陣，以 `tools/bake.py font` 從 macOS 系統字型（SF Mono、Menlo、New York、
  黑體-繁、宋體-繁）渲染而成。這些字型屬於 Apple，其授權限制字型本身的散布；本檔只含渲染後的低解析度點陣，
  不含字型檔。若你要把本作另作他用，建議改用開源字型（例如 Noto Sans/Serif TC、JetBrains Mono）重新烘焙。

## 商標與聲明

- Claude、Claude Code 及其介面與吉祥物屬於 Anthropic。本作模仿其終端機介面作為同人演出。
- 這是非官方同人作品，與 Anthropic、Mili、MisakaZentai 均無從屬或合作關係，也未經其認可。
- 依 [Mili 官方二創指引](https://projectmili.com/copyright-guidelines)：個人、非商業；本作的程式碼由 AI 撰寫，
  角色圖為 AI 生成，分享時請一併註明。
