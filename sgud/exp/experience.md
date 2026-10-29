# 累積經驗

本檔為執行工作時特有之累積經驗,留給後續之嘗試、執行與判斷,由agent自行編列、擴充與維護.過長時抽出舊者為`experience_<年月日>.md`,並於本檔註明何時抽出.

## bin-mseed2(2026-10-29;輸出夾改 `os.tmpdir()`、第三方授權文)

- **測輸出夾落點:用 `TEMP`/`TMP` 導向,不比對系統暫存夾**。`os.tmpdir()` 在 Windows 讀 `TEMP`→`TMP`,且每次呼叫重讀;子行程以 `env: {...process.env, TEMP, TMP}` 指到 `test/_tmp/WDataMseed/` 下專用夾,本行程內測試暫改 `process.env.TEMP/TMP` 並還原。如此斷言「專用夾內恰有一個保留夾/成功後為空」才精確,不受系統暫存夾他人之檔干擾。主檔因此須在**呼叫當下**取 `os.tmpdir()`(不在模組載入時取)。
- **成功路徑的輸出夾刪除後無從事後觀察**:測「夾建在哪」須在啟動子行程當下記錄(`childConvert.mjs` 與主測試皆攔截 `cp.spawn` 記 `opt.cwd`),只斷言「事後工作路徑內無檔」在舊碼也綠(夾已刪),不是紅燈。
- **非 miniSEED 輸入之 reject 訊息天然含夾路徑**(mseed2ascii 的 `Error reading <夾>\temp.mseed: …`),故「訊息含保留夾路徑」在真 exe 案單獨斷言並不分辨有無 `rejectKeep`;分辨力來自假子行程案(無輸出訊息)與 `fsCopyFile error`/`fpIn is not file` 兩案。
- **對 `fs.copyFileSync` 暫改可觸發 `fsCopyFile error`/`fpIn is not file`**(wsemi `fsCopyFile` 以 `import fs from 'fs'` 之同一物件呼叫);暫改前先 `await wds.ensureBins()`,避免快取尚空時下載/鏡像複製被誤傷;`finally` 還原。
- **舊碼把輸出夾建在專案根**:修前紅時 `fpIn is not file`/`fsCopyFile error` 兩案在專案根留下空夾 `_<時間>-<id>`,須手動清;修後不再發生(夾在 `os.tmpdir()`,測試以專用夾承接)。
- **授權文取得**:`cygwin1.dll`/`cygz.dll` 的版本不要憑記憶,從檔案內嵌字串讀(`cygwin-<版本>-<修訂>.x86_64` 建置路徑、`deflate <版本> Copyright <年>`),再依版本取官方原文。Cygwin 原始碼 tag 為 `cygwin-3_3_4-release`(不是 `cygwin-3.3.4`;以 `git ls-remote --tags https://sourceware.org/git/newlib-cygwin.git` 查);`winsup/CYGWIN_LICENSE` 稱「見 COPYING.LIB」之 LGPLv3 全文在 **`winsup/COPYING.LIB`**(根目錄 `COPYING.LIB` 是 LGPL 2.1,不同檔);`winsup/COPYING` 是 GPLv3,只涵蓋未連入 DLL 之工具。zlib 1.2.12 無獨立 LICENSE 檔,取其 `README` 之 Copyright notice(與 `zlib.h` 檔頭之授權段逐字相同)。
- 測試 `unit-binManifest` 的授權案自 dll 內讀版本與年份,與 `licenses/README.md`、`zlib-license.txt` 對照,日後換 dll 而忘了更新授權文會變紅。

## bin-mseed(2026-10-29;D 類改檔案組、移除 `process.chdir`)

- **wsemi 1.9.30 之 `execProcess` 沒有 `cwd` 選項**(只有 mode、cbStdout、cbStderr、codeCmd、useChcp、timeout、onTrace),而 mseed2ascii 的輸出檔預設寫在工作路徑、無輸出夾參數(`-o` 會把所有 channel 合成單檔,不是要的結果)。故自有 `runExe`(`child_process.spawn` 加 `cwd`)。日後 wsemi 增 `opt.cwd` 即可換回。
- **舊版 `process.chdir` 之併發錯誤可穩定重現**:呼叫 B 開始時 cwd 已被 A 切到 A 的輸出夾,B 記下的「原工作路徑」就是 A 的輸出夾;A 結束後刪掉它,B 結束時 `process.chdir(A的輸出夾)` 丟 `ENOENT`(修前紅:`src/WDataMseed.mjs:189`)。測「併發」須兩個輸入不同(取 `g.mseed` 前 200 筆與後 200 筆記錄,channel 不同、輸出檔名不同),並以獨立執行的 exe 當 oracle。
- **mseed2ascii 的行為**:成功時離開碼 0,訊息(`Wrote N samples for …`)在 stderr;輸入非 miniSEED 時**離開碼仍為 0**、無輸出檔、stderr 為 `Error reading …: No SEED data detected`。舊碼只在 execProcess reject 時才記錯誤字串,現行 wsemi 於離開碼 0 即 resolve,故舊版對壞檔 reject `null`(訊息遺失);`runExe` 一律保留合併輸出,無輸出檔時以之 reject。
- **攔截 `child_process.spawn` 之寫法**:主檔須 `import cp from 'child_process'` 並以 `cp.spawn(...)` 呼叫(default 匯出即 CJS 物件,測試改其屬性才會生效);若改成具名匯入 `{ spawn }`,測試改屬性無效而攔不到。wsemi 之 `fsEnsureBins` 自己用具名匯入 spawn(只用於 tar),不受影響。
- **`E_OFFLINE_MISSING` 對檔案組之 `missing` 旗標**:組不整齊(缺一檔)時,錯誤物件 `missing[0].bundle.files[*].missing` 對**全組各檔**皆為 `true`(意為「本次未取得」),不是只標缺的那一檔;測試只斷言全組被列出與應放之組資料夾,不斷言單檔旗標。
- **git 命令的 `^{commit}` 在 `execSync`(經 cmd.exe)下 `^` 被當跳脫字元吃掉**,`git cat-file -e <c>^{commit}` 變成找不到,測試因此被 `this.skip()` 而「靜默略過」(pending 1 案才發現);改 `execFileSync('git', [...])` 傳陣列。
- **T1 誘餌**:先在 `bin-cache/decoy/`、`test/_tmp/…/leak/`、`mseed2ascii-2.6/` 放 exe/dll 再 `npm pack --dry-run --json`,缺任一條 `.npmignore` 規則即確定性變紅(變異 M11~M15 全擊殺);`bin/mseed2ascii/` 三檔本身是真檔,由 `/bin/*` 排除。測完在 `finally` 刪誘餌並還原 `bin-cache/`。
- **變異工具**:副本內跑 4 個測試檔,以 `--reporter json --reporter-option output=<檔>` 取失敗案例;`.npmignore` 等檔在 Windows 為 CRLF,變異之文字比對須容許 `\r?\n`;無 `cwd` 之變異(M01)會在副本根留下 `*.csv` 與 `_<時間>-<id>` 夾,須在下一項前清掉,否則污染下一項之「專案根無輸出檔」斷言。對 wsemi 內部之變異(快取不校驗、只校驗首檔)在副本的 `node_modules/wsemi/src` 做,不動 repo 之 `node_modules`。
- **UMD 實測不動 repo 之 `dist/`**:`rollupFiles` 給 `fdTar` 時會先清空該夾,故建到 `tmp/bin-mseed/umd/dist/` 並於 `tmp/bin-mseed/umd/bin/` 放清單,`require` 後驗證套件根由 `__filename` 推得(離線缺檔時錯誤的 `cachePath` 在該層之 `bin-cache/` 下)。
- **工作樹行尾**:`src/`、`.npmignore` 等為 CRLF(autocrlf),`Write` 新建之檔為 LF;`bin/` 下 `.gitattributes` 設 `binary`,不轉換。
