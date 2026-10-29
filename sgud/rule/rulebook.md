# 規則帳本

本檔為套件設計與開發階段之規則帳本(藍圖),為要求程式碼須長成什麼樣,或由規格產出之測試(項目/說明/流程)有哪些,包含軸、單一擁有者、已知限制、破壞性變更紀錄,以及對應是哪些測試檔案或指令等,由agent自行編列、擴充與維護.當前已做到哪些記於`sgud/state/state.md`.過長時依類型拆為`rulebook_<類型>.md`,本檔只留索引.

## 索引

- R-BIN 外部執行檔(mseed2ascii.exe 與兩個 dll 之檔案組)之存放、下載、校驗與離線:本檔下節.
- R-RUN 轉檔子行程之工作路徑:本檔下下節.

## R-BIN 外部執行檔 mseed2ascii 之存放、下載、校驗與離線(2026-10-29 立;bin-mseed;D 類、檔案組;制式規格正本:`C:\opensrcOper\dspec\外部執行檔之存放下載校驗與離線.md`,本節只摘要本套件之落實,規則不得與正本偏離)

### R-BIN-00 單一擁有者

- 取得執行檔路徑只有一個入口:`src/ensureBins.mjs`(轉呼叫 wsemi `fsEnsureBins`,`pkgRoot` 由 `import.meta.url` 推得為 `src/` 或打包後 `dist/` 之上一層,不依賴工作目錄)。**本套件不得自寫下載、快取、校驗、鏡像**(規格 E2)。唯一使用處為 `src/WDataMseed.mjs` 之主函數(每次呼叫;取不到則在建輸出夾之前整個 reject)。
- 清單 `bin/manifest.json`(`mode:"pinned"`、`repo:"yuda-lyu/w-data-mseed"`、`commit` 為含 `bin/mseed2ascii/` 之提交 `b296900a3b8ceccfbecec747955a28484299120f`、頂層 `bundles` 一組 `mseed2ascii`)由 `toolg/genBinManifest.mjs --commit <提交>` 依實檔產生,**不手寫**;`bin/` 內有未列入清單之檔時該工具拒絕產生。
- 組內三檔:`mseed2ascii.exe`(2.6)、`cygwin1.dll`、`cygz.dll`;exe 須與兩 dll 相鄰(單獨複製 exe 啟動為 0xC0000135),故為檔案組(規格 M6)。主函數取 `r.bundles.mseed2ascii.files['mseed2ascii.exe']` 啟動(即快取內組資料夾之 exe)。

### R-BIN-01 規則

| 編號 | 規則 | 規格 | 落點 |
|---|---|---|---|
| B1 | 執行檔與 dll 不入 npm 包,只有 `bin/manifest.json` 入包;舊路徑資料夾 `mseed2ascii-2.6/` 整個不入包 | S1 | `.npmignore`:`/bin/*`、`!/bin/manifest.json`、`/bin-cache/`、`/test/_tmp/`、`/mseed2ascii-2.6/` |
| B2 | 執行檔放自家 repo 之 `bin/mseed2ascii/`(入 git;`bin/** binary`);D 類舊路徑 `mseed2ascii-2.6/` 內之三檔已移除(舊版隨 npm 包發布,不自 GitHub 取);該資料夾之原始碼、`LICENSE`(GPL-3)、`doc/`、`說明.md` 留在 repo 供提供原始碼 | S2、F12 | `bin/mseed2ascii/`、`.gitattributes`、`mseed2ascii-2.6/` |
| B3 | 快取 `bin-cache/` 不入 git 與 npm 包 | S5 | `.gitignore`、`.npmignore` |
| B4 | 首次使用才取得,不在 `postinstall` | D1 | 主函數;`package.json` 無 install 類 script |
| B5 | 快取為內容定址之組資料夾 `<快取>/<組識別>/{exe,dll×2}`(`W_BIN_CACHE` 時 `<W_BIN_CACHE>/w-data-mseed/<組識別>/`),組識別為組內 `(path, sha256)` 排序後之雜湊(sha256sum 格式);各檔逐一校驗後整組原子發布,一檔不符整組重取;命中亦校驗;`W_BIN_CACHE`、`W_BIN_MIRROR`、`W_BIN_OFFLINE` 由 wsemi 統一讀取;`ensureBins()` 不轉傳 `floatingManifestUrl` | D3、D4、M6、O1~O3 | `src/ensureBins.mjs` |
| B6 | 匯出 `ensureBins()`:`WDataMseed.ensureBins`(靜態屬性;主檔 default 匯出,**不加具名匯出**,UMD 形態不變) | D1、E2③ | `src/WDataMseed.mjs` 末段 |
| B7 | 取不到執行檔之錯誤:主函數 reject 字串 `[<code>] <訊息>`(沿用本函數以字串 reject 之契約),`ensureBins()` 自身 reject 帶 `code` 之 `Error`;不再是字串 `can not find folder for mseed2ascii` | E3 | 主函數 |
| B8 | 離線(`W_BIN_OFFLINE=1`)缺組內任一檔:`E_OFFLINE_MISSING`,訊息列全組各檔(名稱、sha256、大小)與應放之組資料夾(快取與鏡像) | O3、M6 | wsemi;`api-ensureBins` › T6 |
| B9 | 輸出夾(`opt.fdOutPre` 前綴之臨時夾)建於 `os.tmpdir()`(R-RUN R6),不在執行檔所在夾,亦不在呼叫端工作路徑;執行檔所在之快取夾不得新增任何檔 | §9 交換檔 | 主函數;`api-WDataMseed` 首案、R6 各案 |
| B10 | 隨 GitHub 散布之第三方檔(`cygwin1.dll`、`cygz.dll`)其授權全文留在 repo `licenses/`(入 npm 包,作法同 w-mousekey);`licenses/README.md` 每個組內檔一列,載明檔內實際版本與文本來源;組內檔更新時須同步更新(測試自檔案內讀版本比對) | 第三方授權 | `licenses/`;`unit-binManifest` › `should keep the full license texts…` |

### R-BIN-02 更新流程(規格 U1,兩步提交)

1. 重編 mseed2ascii(步驟見 `mseed2ascii-2.6/說明.md`),產物(三檔)複製到 `bin/mseed2ascii/`。
2. **提交並推 GitHub**(得提交雜湊;執行檔之提交在前),再 `node toolg/genBinManifest.mjs --commit <該提交>` 產生清單(工具會拒絕 `bin/` 與該提交不一致者,及未列入任何組之檔),清單於下一個提交。
3. 跑 `unit-binManifest`(清單與實檔一致,且釘選提交內之位元組與工作樹相同),發布新版。

### R-BIN-03 對應測試(規格 §8)

| 規格 | 測試檔 › 案例 |
|---|---|
| T1 打包清單無執行檔、dll、舊路徑 | `unit-binManifest` › `should not pack external executables, dlls or the old folder…`(先在 `bin-cache/`、`test/_tmp/`、`mseed2ascii-2.6/` 放誘餌;`npm pack --dry-run --json`:無 exe/dll/msi/zip/7z/分割、`bin/` 下只有 `manifest.json`、`src/ensureBins.mjs` 在包內) |
| T2 `bin/` 實檔與清單一致;無漏列;提交內位元組＝工作樹 | `unit-binManifest` › `should match the real files in bin/ and list every file there`、`should have the bytes of bin/mseed2ascii/ in the pinned commit equal to the working tree` |
| M1/M2/M6 清單形狀、組識別 | `unit-binManifest` › `should pass the schema check…`、`should be a pinned manifest…`、`should derive the bundle id…` |
| 舊路徑三檔已移除、原始碼與 GPL-3 授權文留存 | `unit-binManifest` › `should drop the executables from the old path…` |
| T3 首次整組下載→校驗→快取;第二次不連網;併發共用 | `api-ensureBins` › `T3`(2 案) |
| T4 組內任一檔雜湊/大小不符→整組拒用、不留檔 | `api-ensureBins` › `T4`(3 檔 × 同大小異內容/截短/加長) |
| T5 鏡像(本地資料夾)整組取得;組內一檔被竄改→拒用(連網補自 GitHub、離線 `E_OFFLINE_MISSING`) | `api-ensureBins` › `T5`(2 案) |
| T6 離線缺檔之錯誤格式(全組列出;缺一檔亦列全組;鏡像路徑) | `api-ensureBins` › `T6`(3 案)、`api-WDataMseed` › 離線案 |
| T7 快取組內一檔被竄改/截短/刪除→整組重取;離線不回傳 | `api-ensureBins` › `T7`(2 案) |
| T8 主幹模式 | 不適用(本套件為釘選模式) |
| 不轉傳 `floatingManifestUrl`、套件根與 cwd 無關、靜態屬性且無具名匯出 | `api-ensureBins` › 後三案 |
| 主函數:不連網(攔截全域 `fetch`)、啟動者為快取組資料夾內之 exe(攔截 `child_process.spawn`)、他處 cwd 載入並轉檔 | `api-WDataMseed` › 首案、離線案、`works when loaded and called from another working directory` |
| 功能測試之執行檔來源 | `test/tools/binEnv.mjs`:把 `bin/mseed2ascii/` 依清單放成本機鏡像(`test/_tmp/<tag>/mirror/w-data-mseed/<組識別>/`),設 `W_BIN_CACHE`、`W_BIN_MIRROR`、`W_BIN_OFFLINE=1`;組識別由測試獨立計算 |

### R-BIN-04 已知限制

1. 首次使用需連 GitHub 或有鏡像;無網路且無鏡像者以 `E_OFFLINE_MISSING` 明確失敗(README〈External executable〉有離線部署步驟)。
2. `cygwin1.dll`(Cygwin 3.3.4-2)、`cygz.dll`(zlib 1.2.12)之授權全文在 `licenses/`(B10);`mseed2ascii` 之 GPL-3 文與原始碼在 `mseed2ascii-2.6/`。
3. `mseed2ascii-2.6/src/*.o` 為舊有之建置產物,留在 repo(未動)。
4. (已解決,2026-10-29 bin-mseed2)臨時輸出夾原建在模組載入時之工作路徑,現改建於 `os.tmpdir()`,見 R-RUN R6。

## R-RUN 轉檔子行程之工作路徑(2026-10-29 立;bin-mseed)

| 編號 | 規則 | 落點 / 測試 |
|---|---|---|
| R1 | mseed2ascii 預設把輸出檔寫在工作路徑且無輸出夾參數,故以 `child_process.spawn` 之 `cwd` 選項指向各次轉換專用之輸出夾;**不得用 `process.chdir`**(全域狀態,併發轉換會互相還原到對方已刪之夾;舊版實測 `chdir ENOENT`) | `src/WDataMseed.mjs` `runExe`;`api-WDataMseed` › `runs two conversions at the same time…`、首案(`opt.cwd`、`process.cwd()` 不變) |
| R2 | 呼叫端之 `process.cwd()` 於任何情形(成功、失敗、併發)皆不變 | `api-WDataMseed` 之 `afterEach` |
| R3 | 啟動子行程用 `windowsHide: true`、`shell: false`;`error` 事件須先於存取 stdout/stderr 監聽 | `runExe`;`api-WDataMseed` 首案、`rejects with spawn[code]…` |
| R4 | 無輸出檔時 reject 之值為字串:離開碼非 0 為 `code[N]:\n輸出`,無法啟動為 `spawn[錯誤碼]:\n訊息`(同 wsemi `execProcess` 之格式),離開碼為 0 而無輸出檔(如輸入非 miniSEED)為 mseed2ascii 之輸出訊息;輸出夾保留供查找,**訊息末行附其絕對路徑**(`output folder kept for inspection: <路徑>`,R6;輸出夾已建立後之三種 reject〔`fsCopyFile error`、`fpIn is not file`、無輸出檔〕皆經 `rejectKeep`) | `api-WDataMseed` › `rejects with the message of mseed2ascii…`、`rejects with spawn[code]…`、`rejects with code[N]…` |
| R5 | wsemi `execProcess` 無 `cwd` 選項(1.9.30),故本套件自有 `runExe`(僅啟動與收輸出,不含下載/校驗);wsemi 日後增 `opt.cwd` 時改回 `execProcess` | 建議見報告〈待裁示〉 |
| R6 | 臨時輸出夾(`path.resolve(os.tmpdir(), fdOutPre + 時間戳 + '-' + 亂數)`,`os.tmpdir()` 於每次呼叫時取值)建於作業系統暫存夾,呼叫端工作路徑內不出現任何檔;成功且 `readWithData=true` 刪除該夾;失敗保留並於 reject 訊息附其絕對路徑。`fdOutPre` 仍為夾名前綴(預設 `_`;相對值落在 `os.tmpdir()`,絕對值照給);不得再以 `path.resolve()`(工作路徑)為基底 | `src/WDataMseed.mjs` `rejectKeep`、`fdOut`;`api-WDataMseed` › `works when loaded and called from another working directory…`、`fails from another working directory…`、`creates the output folder in os.tmpdir()…`、`names the absolute path of the kept output folder in every reject…`(測試以 `TEMP`/`TMP` 把 `os.tmpdir()` 導向 `test/_tmp/WDataMseed/` 下專用夾) |
