import fs from 'fs'
import path from 'path'
import crypto from 'crypto'


//測試用共用工具: 以repo內bin/之實檔建本機鏡像(<鏡像>/<pkg>/<組識別>/<path>, 規格M6、O1), 並設W_BIN_MIRROR、W_BIN_CACHE、W_BIN_OFFLINE=1,
//使需要實際mseed2ascii.exe之功能測試不連外網即可取得(快取與鏡像皆在test/_tmp/<tag>/), 回傳restore函數還原環境變數並刪除該資料夾
let keys = ['W_BIN_MIRROR', 'W_BIN_CACHE', 'W_BIN_OFFLINE']


function readManifest() {
    return JSON.parse(fs.readFileSync('bin/manifest.json', 'utf8'))
}


//bundleId, 檔案組之組識別(規格M6): 組內各檔依path排序(字串碼位)後逐行`<sha256>  <path>\n`(同sha256sum輸出)之SHA-256
//獨立於被測函數計算, 用以核對被測函數實際放置之位置
function bundleId(files) {
    let ls = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    let s = ls.map((f) => `${f.sha256}  ${f.path}\n`).join('')
    return crypto.createHash('sha256').update(s, 'utf8').digest('hex')
}


//getBundle, 清單內名為mseed2ascii之檔案組
function getBundle(manifest) {
    return manifest.bundles.find((v) => v.name === 'mseed2ascii')
}


//putMirrorBundle, 把repo bin/內該組之實檔放成鏡像之組資料夾<fdMirror>/<pkg>/<組識別>/<path>, 回傳組資料夾
function putMirrorBundle(fdMirror, manifest = readManifest()) {
    let b = getBundle(manifest)
    let fd = path.join(fdMirror, manifest.pkg, bundleId(b.files))
    for (let f of b.files) {
        let fp = path.join(fd, ...f.path.split('/'))
        fs.mkdirSync(path.dirname(fp), { recursive: true })
        fs.copyFileSync(path.resolve(b.dir, ...f.path.split('/')), fp)
    }
    return fd
}


function setBinEnv(tag) {
    let fdt = path.resolve(`./test/_tmp/${tag}`)
    fs.rmSync(fdt, { recursive: true, force: true })
    let manifest = readManifest()
    putMirrorBundle(path.join(fdt, 'mirror'), manifest)

    //env
    let bk = {}
    for (let k of keys) {
        bk[k] = process.env[k]
    }
    process.env.W_BIN_MIRROR = path.join(fdt, 'mirror')
    process.env.W_BIN_CACHE = path.join(fdt, 'cache')
    process.env.W_BIN_OFFLINE = '1'

    function restore() {
        for (let k of keys) {
            if (bk[k] === undefined) {
                delete process.env[k]
            }
            else {
                process.env[k] = bk[k]
            }
        }
        fs.rmSync(fdt, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
        try {
            fs.rmdirSync(path.resolve('./test/_tmp')) //尚有其他測試之暫存時非空, 略過
        }
        catch (err) {}
    }

    //groupDir, 快取內該組之資料夾(W_BIN_CACHE時為<W_BIN_CACHE>/<pkg>/<組識別>, 規格D3、M6)
    let groupDir = path.join(fdt, 'cache', manifest.pkg, bundleId(getBundle(manifest).files))

    return { restore, fdt, manifest, groupDir }
}


export { readManifest, bundleId, getBundle, putMirrorBundle, setBinEnv }
