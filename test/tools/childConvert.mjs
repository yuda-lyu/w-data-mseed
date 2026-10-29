import os from 'os'
import cp from 'child_process'
import { pathToFileURL } from 'url'


//測試用子行程腳本: 於他處工作目錄載入套件主函數並轉檔, 把摘要以JSON輸出到stdout
//用法: node test/tools/childConvert.mjs <src/WDataMseed.mjs之絕對路徑> <輸入檔之絕對路徑>
//執行檔取得方式(W_BIN_MIRROR、W_BIN_CACHE、W_BIN_OFFLINE)與暫存夾(TEMP、TMP)由環境變數繼承自父行程
//spawnCwds: 轉換期間子行程啟動時所用之cwd(即輸出夾; 成功時輸出夾轉換後已刪, 須在啟動當下記錄)
let [, , fpSrc, fpIn] = process.argv
let spawnCwds = []
let spawnOri = cp.spawn
cp.spawn = function(prog, args, opt, ...rest) {
    spawnCwds.push(opt.cwd)
    return spawnOri.call(this, prog, args, opt, ...rest)
}
let { default: wds } = await import(pathToFileURL(fpSrc).href)
let out = { cwd: process.cwd(), tmpdir: os.tmpdir(), err: null, names: [], counts: [], spawnCwds }
await wds(fpIn)
    .then((rs) => {
        out.names = rs.map((v) => v.name)
        out.counts = rs.map((v) => v.data.records.length)
    })
    .catch((err) => {
        out.err = String(err)
    })
out.cwdAfter = process.cwd()
process.stdout.write(`\n#RESULT#${JSON.stringify(out)}`) //失敗時主函數會先印出說明, 故以標記分隔
