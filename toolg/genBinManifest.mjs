//產生bin/manifest.json(規格M1、M6: 依repo內實檔計算sha256與大小, 不手寫)
//用法: node toolg/genBinManifest.mjs --commit <含bin/實檔之提交(40碼)>
//流程(規格U1): 替換bin/內檔 → 提交並推GitHub(得提交雜湊) → 本工具 --commit <該提交> → 跑測試(M4) → 發布新版
//mseed2ascii之重編(見mseed2ascii-2.6/說明.md): 產物(mseed2ascii.exe、cygwin1.dll、cygz.dll)複製到bin/mseed2ascii/後, 以本工具重產清單
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import fsGetBinManifestEntry from 'wsemi/src/fsGetBinManifestEntry.mjs'


//---- 本套件之設定(只改這段) ----

//mode, 'pinned'(預設)或'floating'
let mode = 'pinned'

//bundles, 檔案組(規格M6: mseed2ascii.exe須與cygwin1.dll、cygz.dll相鄰), 鍵為組名(ensureBins結果物件之鍵):
//  { dir: 'bin/<資料夾>' }: repo之該資料夾內全部檔(遞迴)為組內檔, 組內路徑為相對於該資料夾之路徑
let bundles = {
    'mseed2ascii': { dir: 'bin/mseed2ascii' },
}

//---- 以下不需修改 ----

let pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
let i = process.argv.indexOf('--commit')
let commit = i >= 0 ? String(process.argv[i + 1] || '') : ''
if (mode === 'pinned' && !/^[0-9a-f]{40}$/.test(commit)) {
    console.log('usage: node toolg/genBinManifest.mjs --commit <40 lowercase hexadecimal characters>')
    process.exit(1)
}

//git, 釘選之提交內之bin/須與工作樹相同(不含manifest.json), 否則清單會指到不同內容
let git = (args) => {
    return execFileSync('git', args, { encoding: 'utf8', windowsHide: true })
}
if (commit !== '') {
    git(['cat-file', '-e', `${commit}^{commit}`])
    let diff = git(['diff', '--name-only', commit, '--', 'bin', ':(exclude)bin/manifest.json']).trim()
    if (diff !== '') {
        console.log(`bin/ differs from commit ${commit}:\n${diff}`)
        process.exit(1)
    }
}

let pick = (e) => {
    return { sha256: e.sha256, size: e.size }
}

//walk, 資料夾內全部一般檔之相對路徑(/分隔, 排序); 以讀資料夾列舉(含尚未git add之新換檔)
let walk = (fd) => {
    let r = []
    let f = (d, rel) => {
        for (let n of fs.readdirSync(d).sort()) {
            let p = path.join(d, n)
            let q = rel ? `${rel}/${n}` : n
            let st = fs.lstatSync(p)
            if (st.isDirectory()) {
                f(p, q)
            }
            else if (st.isFile()) {
                r.push(q)
            }
            else {
                throw new Error(`not a regular file: ${p}`)
            }
        }
    }
    f(fd, '')
    return r
}

let bundleList = []
let used = new Set(['bin/manifest.json'])

//檔案組
for (let [name, b] of Object.entries(bundles)) {
    let bf = []
    for (let rel of walk(b.dir)) {
        used.add(`${b.dir}/${rel}`)
        let e = await fsGetBinManifestEntry(path.join(b.dir, ...rel.split('/')), { name: null, path: rel })
        bf.push({ path: e.path, ...pick(e) })
    }
    bundleList.push({ name, dir: b.dir, files: bf })
}

//bin/內不屬於任何檔案組之檔(含舊版殘留)一律視為錯誤, 避免清單漏列
let extra = walk('bin').map((rel) => `bin/${rel}`).filter((p) => !used.has(p))
if (extra.length > 0) {
    console.log(`bin/ has file(s) not listed in any bundle:\n${extra.join('\n')}`)
    process.exit(1)
}

let manifest = { schema: 1, pkg: pkg.name, mode, repo: `yuda-lyu/${pkg.name}` }
if (commit !== '') {
    manifest.commit = commit
}
manifest.bundles = bundleList
fs.writeFileSync('bin/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`bin/manifest.json: ${bundleList.length} bundle(s)`)
