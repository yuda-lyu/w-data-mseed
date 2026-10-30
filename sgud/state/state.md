# 狀態(現況)

本檔只記現況(各功能做到哪裡、對應之規則帳本條目與測試檔、已知缺口與待辦、最近一次驗證或發布之版本),不寫過程;過程與教訓見 `sgud/exp/experience.md`,規則細節見 `sgud/rule/rulebook.md`。

- 套件版本:`package.json` 為 1.0.38(本輪未改);發布與版號由維護者與主控決定。
- 依賴現況:`wsemi ^1.9.33`(2026-10-30 第 179 項自 `^1.9.30` 升:`execProcess` 之 `opt.cwd` 自 1.9.33 起;檔案組〔`bundles`〕自 1.9.30 起),`node_modules` 內為 1.9.33;`w-package-tools ^1.1.21`(已為最新)。

## 功能與規則、測試對照

| 功能 | 規則(rulebook) | 測試檔 | 狀態 |
|---|---|---|---|
| `WDataMseed(fp, opt)`:miniSEED 轉 GeoCSV 並解析(僅 Windows) | R-RUN | `WDataMseed.test`(黃金檔 `test/g.json`)、`api-WDataMseed` | 完成 |
| 轉檔子行程以 wsemi `execProcess(..., { cwd })` 指定輸出夾,不改 `process.cwd()`,併發互不干擾;輸出夾於啟動前消失時 reject 指向 cwd | R-RUN R1~R5 | `api-WDataMseed`(含全文相等之失敗訊息案、cwd 不存在案) | 完成(bin-mseed,2026-10-29;第 179 項改用 `execProcess`,2026-10-30,待主控複審與發布) |
| 臨時輸出夾建於 `os.tmpdir()`;失敗保留夾且 reject 訊息附其絕對路徑 | R-RUN R4、R6 | `api-WDataMseed`(R6 四案) | 完成(bin-mseed2,2026-10-29) |
| 第三方檔(`cygwin1.dll` Cygwin 3.3.4-2、`cygz.dll` zlib 1.2.12)授權全文留 repo | R-BIN B10 | `unit-binManifest` › `should keep the full license texts…` | 完成(bin-mseed2,2026-10-29) |
| **外部執行檔組 `mseed2ascii`(exe＋2 dll)之存放/下載/校驗/離線(D 類、檔案組、制式規格)** | **R-BIN** | **`unit-binManifest`(T1、T2、清單形狀;與平台無關)、`api-ensureBins`(T3~T7、環境變數、套件根、靜態屬性;與平台無關)、`api-WDataMseed`(主函數整合;僅 Windows);功能測試之執行檔由 `test/tools/binEnv.mjs` 供** | **完成(bin-mseed,2026-10-29),待主控跑全套與發布** |

## 外部執行檔(R-BIN)現況

- `mseed2ascii.exe`(2.6)、`cygwin1.dll`、`cygz.dll` **不隨 npm 包發布**;包內只有 `bin/manifest.json`(pinned,`commit` b296900a3b8ceccfbecec747955a28484299120f,一個檔案組 `mseed2ascii` 三檔共 3926268 位元組)。`mseed2ascii-2.6/` 內三檔已移除,三檔在 `bin/mseed2ascii/`(入 git;`.gitattributes` `bin/** binary`);`mseed2ascii-2.6/` 其餘(原始碼、`LICENSE` GPL-3、`doc/`、`libmseed/`、`說明.md`)留在 repo,`.npmignore` 排除整個資料夾。
- 取得入口 `src/ensureBins.mjs`(wsemi `fsEnsureBins`);主函數每次呼叫經它取得快取內組資料夾之 exe;預設快取 `<套件根>/bin-cache/<組識別>/`,環境變數 `W_BIN_CACHE`、`W_BIN_MIRROR`、`W_BIN_OFFLINE`;`WDataMseed.ensureBins()` 供預先取得(靜態屬性)。
- 改 exe 之流程見 R-BIN-02(兩步提交)與 `mseed2ascii-2.6/說明.md`。
- README:〈External executable〉(含所附工具與授權、原始碼位置)與〈Breaking changes: external executable〉兩節;授權指向 `licenses/`。
- `licenses/`(入 git 與 npm 包):`Cygwin-CYGWIN_LICENSE.txt`、`Cygwin-LGPL-3.0.txt`、`Cygwin-newlib-COPYING.NEWLIB.txt`(Cygwin 源碼 tag `cygwin-3_3_4-release`)、`zlib-license.txt`(zlib v1.2.12 README 之 Copyright notice)、`README.md`(對照表與來源網址);`mseed2ascii` 之 GPL-3 在 `mseed2ascii-2.6/LICENSE`。
- rollup UMD:`toolg/gDistRollup.mjs` 之 external/globals 已補 `url`、`crypto`、`stream`、`stream/promises`、`os`;`dist/` 未重編(發布時自動產製);已在 `tmp` 建出 UMD 實測:default 為函數、靜態 `ensureBins`、套件根由 `__filename` 推得、轉檔等於黃金檔。
- 待辦:發布前在連網機器實跑一次 `WDataMseed.ensureBins()` 確認真實 GitHub 網址之下載(測試不連外網,未實測);下游以舊路徑(`mseed2ascii-2.6/mseed2ascii.exe`、`node_modules/w-data-mseed/mseed2ascii-2.6/`)查找者須改用 `ensureBins`(見報告〈待裁示〉)。

## 已知缺口與待辦

1. (已解決,2026-10-30 第 179 項)原自有 `runExe` 已刪,改用 wsemi `execProcess` 之 `opt.cwd`(R-RUN R1、R5)。
2. JSDoc 之 `opt.ver`(Net Framework 版本)為舊有殘留,程式未使用;非本輪範圍,未動。
3. 讀取輸出檔失敗(`readData` 拋錯)時不經 `rejectKeep`(例外訊息本身含檔案路徑,保留夾亦在其中);未另處理。
4. 輸出夾於子行程啟動前已被他處刪除時,reject 訊息仍附 `output folder kept for inspection: <夾>`(該夾已不存在,字句不實);極罕見之競態,`rejectKeep` 不查夾是否存在,範圍外未改。
