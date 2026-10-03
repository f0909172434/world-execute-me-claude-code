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

## 角色圖（CC BY-NC-SA 4.0）

- **檔案**：`assets/src/claude-girl.webp`，以及由它衍生的 `assets/claude.rgba.gz`（去背、縮放）、
  `docs/preview.png` 與影片中她的所有形象。
- **作者**：Chih-Kai Wang（[@f0909172434](https://github.com/f0909172434)），以 AI 生成的 Claude 擬人二創圖。
- **授權**：[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)，全文見
  [LICENSES/CC-BY-NC-SA-4.0.txt](LICENSES/CC-BY-NC-SA-4.0.txt)。使用時請署名並註明改動、不得商用，
  改編作品以相同授權分享。此授權不涉及 Claude、Claude Code 的商標權利。

## 字形點陣（SIL OFL 1.1）

- **檔案**：`assets/font.json.gz`
- **說明**：大字用的字形覆蓋率點陣，由 `tools/fetch_fonts.sh` 下載、`tools/bake.py font` 渲染。上標 `ᵀ` 由 `T` 縮小上移合成。
- **字型**（皆為 SIL Open Font License 1.1，取自 [google/fonts](https://github.com/google/fonts)）：

  | 字型 | 版權 | 授權全文 |
  |---|---|---|
  | JetBrains Mono | The JetBrains Mono Project Authors | [LICENSES/OFL-jetbrainsmono.txt](LICENSES/OFL-jetbrainsmono.txt) |
  | Source Serif 4 | The Source Serif 4 Project Authors | [LICENSES/OFL-sourceserif4.txt](LICENSES/OFL-sourceserif4.txt) |
  | Noto Sans TC / SC | Adobe（Reserved Font Name "Source"） | [LICENSES/OFL-notosanstc.txt](LICENSES/OFL-notosanstc.txt)、[OFL-notosanssc.txt](LICENSES/OFL-notosanssc.txt) |
  | Noto Serif TC / SC | Google Inc. | [LICENSES/OFL-notoseriftc.txt](LICENSES/OFL-notoseriftc.txt)、[OFL-notoserifsc.txt](LICENSES/OFL-notoserifsc.txt) |

- 這份點陣是上述字型的衍生版本，依 OFL 1.1 以相同授權提供，不使用其保留字型名稱。

## 商標與聲明

- Claude、Claude Code 及其介面與吉祥物屬於 Anthropic。本作模仿其終端機介面作為同人演出。
- 這是非官方同人作品，與 Anthropic、Mili、MisakaZentai 均無從屬或合作關係，也未經其認可。
- 依 [Mili 官方二創指引](https://projectmili.com/copyright-guidelines)：個人、非商業；本作的程式碼由 AI 撰寫，
  角色圖為 AI 生成，分享時請一併註明。
