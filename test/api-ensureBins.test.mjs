import fs from 'fs'
import os from 'os'
import http from 'http'
import path from 'path'
import crypto from 'crypto'
import assert from 'assert'
import { execFileSync } from 'child_process'
import ensureBins from '../src/ensureBins.mjs'
import * as nsWDataMseed from '../src/WDataMseed.mjs'
import { readManifest, bundleId, getBundle, putMirrorBundle } from './tools/binEnv.mjs'


//規格: 外部執行檔之存放下載校驗與離線(制式規格) D1、D3、D4、M6、O1、O2、O3、E2、E3、§8 T3~T7(T8為主幹模式, 本套件為釘選模式, 不適用)
//本套件之mseed2ascii.exe須與cygwin1.dll、cygz.dll相鄰, 故以檔案組(M6)進行: 整組取得、一檔竄改即整組重取、離線缺檔時列出全組
//以本機HTTP伺服器扮raw.githubusercontent.com(自有檔網址為<repo>/<commit>/<dir>/<path>), 以本地資料夾扮鏡像, 全程不連外網; 取得之檔為repo內bin/mseed2ascii/之實檔
describe(`ensureBins (bundle mseed2ascii)`, function() {
    this.timeout(180000)

    let port = 8947
    let fdt = path.resolve('./test/_tmp/ensureBins')
    let keys = ['W_BIN_MIRROR', 'W_BIN_CACHE', 'W_BIN_OFFLINE']
    let bkEnv = {}

    let manifest = readManifest()
    let b = getBundle(manifest)
    let id = bundleId(b.files)
    let names = b.files.map((v) => v.path)
    let bytesOf = {}
    let urlOf = {}
    for (let f of b.files) {
        bytesOf[f.path] = fs.readFileSync(path.join(b.dir, f.path))
        urlOf[f.path] = `/${manifest.repo}/${manifest.commit}/${b.dir}/${f.path}`
    }
    let badOf = (name) => {
        let bad = Buffer.from(bytesOf[name]) //與實檔同大小而內容不同
        bad[100] = bad[100] ^ 0xff
        return bad
    }

    let bodies = {} //伺服器目前回傳之內容(以檔名為鍵)
    let urls = [] //伺服器收到之請求路徑
    let server = null
    let seq = 0
    let cacheDir = ''

    let sha256Of = (fp) => {
        return crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex')
    }

    //fetchLocal, 僅放行raw.githubusercontent.com之網址並改指本機伺服器, 其餘一律拒絕(確保測試不連外網)
    let fetchLocal = (url, init) => {
        let u = String(url)
        if (!u.startsWith('https://raw.githubusercontent.com/')) {
            return Promise.reject(new Error(`unexpected url[${u}]`))
        }
        return globalThis.fetch(u.replace('https://raw.githubusercontent.com', `http://127.0.0.1:${port}`), init)
    }

    //noNet, 被呼叫即代表連網
    let nNet = 0
    let noNet = () => {
        nNet++
        return Promise.reject(new Error('network must not be used'))
    }

    let listFiles = (fd) => {
        if (!fs.existsSync(fd)) {
            return []
        }
        return fs.readdirSync(fd, { recursive: true, withFileTypes: true }).filter((v) => v.isFile()).map((v) => path.join(v.parentPath, v.name)).sort()
    }

    //groupFiles, 快取內該組應有之全部檔路徑
    let groupFiles = (root) => {
        return names.map((n) => path.join(root, id, n)).sort()
    }

    //verifyGroup, 該組資料夾內每檔之大小與sha256皆等於清單
    let verifyGroup = (fd) => {
        for (let f of b.files) {
            let fp = path.join(fd, f.path)
            assert.strict.equal(fs.statSync(fp).size, f.size, f.path)
            assert.strict.equal(sha256Of(fp), f.sha256, f.path)
        }
    }

    before(async function() {
        fs.rmSync(fdt, { recursive: true, force: true })
        fs.mkdirSync(fdt, { recursive: true })
        server = http.createServer((req, res) => {
            urls.push(req.url)
            let name = names.find((n) => urlOf[n] === req.url)
            if (name) {
                let body = bodies[name]
                res.writeHead(200, { 'content-length': String(body.length) })
                res.end(body)
            }
            else {
                res.writeHead(404)
                res.end()
            }
        })
        await new Promise((resolve, reject) => {
            server.once('error', reject)
            server.listen(port, '127.0.0.1', resolve)
        })
    })

    after(async function() {
        await new Promise((resolve) => {
            server.close(resolve)
        })
        fs.rmSync(fdt, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
        try {
            fs.rmdirSync(path.resolve('./test/_tmp')) //尚有其他測試之暫存時非空, 略過
        }
        catch (err) {}
    })

    beforeEach(function() {
        for (let k of keys) {
            bkEnv[k] = process.env[k]
            delete process.env[k]
        }
        for (let n of names) {
            bodies[n] = bytesOf[n]
        }
        urls.length = 0
        nNet = 0
        seq++
        cacheDir = path.join(fdt, `cache${seq}`)
    })

    afterEach(function() {
        for (let k of keys) {
            if (bkEnv[k] === undefined) {
                delete process.env[k]
            }
            else {
                process.env[k] = bkEnv[k]
            }
        }
    })

    it(`T3: first call downloads the whole group from the pinned-commit urls of GitHub, verifies and caches it; second call hits the verified cache without network (D3, D4, M6, O2)`, async function() {
        //規格M6: 快取位置<快取>/<組識別>/<path>, 組識別為組內(path, sha256)之雜湊(此處獨立計算); O2: 快取未命中時自GitHub(釘選提交)取得
        let r1 = await ensureBins({ fetch: fetchLocal, cacheDir, mirror: '', offline: false })
        let fd = path.join(cacheDir, id)
        assert.strict.equal(r1.mseed2ascii, fd) //回傳組資料夾
        for (let n of names) {
            assert.strict.equal(r1.bundles.mseed2ascii.files[n], path.join(fd, n)) //與各檔路徑
        }
        assert.strict.equal(r1.bundles.mseed2ascii.id, id)
        verifyGroup(fd)
        assert.strict.deepStrictEqual([...urls].sort(), names.map((n) => urlOf[n]).sort()) //M2: 網址ref為清單之40碼提交, 每檔各一次
        assert.strict.deepStrictEqual(listFiles(cacheDir), groupFiles(cacheDir)) //只存最終檔, 無暫存殘留
        assert.strict.equal(fs.readdirSync(cacheDir).length, 1) //快取夾內只有該組資料夾(暫存夾已清)

        //exe與兩個dll相鄰(0xC0000135之成因: 單獨複製exe則找不到dll)
        assert.strict.equal(path.dirname(r1.bundles.mseed2ascii.files['mseed2ascii.exe']), path.dirname(r1.bundles.mseed2ascii.files['cygwin1.dll']))
        assert.strict.equal(path.dirname(r1.bundles.mseed2ascii.files['mseed2ascii.exe']), path.dirname(r1.bundles.mseed2ascii.files['cygz.dll']))

        //規格D4: 第二次不連網(快取命中並校驗)
        let r2 = await ensureBins({ fetch: noNet, cacheDir, mirror: '', offline: false })
        assert.strict.equal(r2.mseed2ascii, fd)
        assert.strict.equal(nNet, 0)
        assert.strict.equal(urls.length, 3)
    })

    it(`T3: concurrent calls share one download of the group (E2)`, async function() {
        let rs = await Promise.all([1, 2, 3].map(() => ensureBins({ fetch: fetchLocal, cacheDir, mirror: '', offline: false })))
        assert.strict.deepStrictEqual(rs.map((r) => r.mseed2ascii), [1, 2, 3].map(() => path.join(cacheDir, id)))
        assert.strict.equal(urls.length, 3)
        verifyGroup(path.join(cacheDir, id))
    })

    it(`T4: a file whose content or size does not match the manifest refuses the whole group and leaves nothing in the cache (D2, E3, M6)`, async function() {
        for (let name of names) {
            for (let [label, mk, code] of [
                ['same size, different content', () => badOf(name), 'E_HASH_MISMATCH'],
                ['truncated', () => bytesOf[name].subarray(0, bytesOf[name].length - 10), 'E_SIZE_MISMATCH'],
                ['longer', () => Buffer.concat([bytesOf[name], Buffer.from('x')]), 'E_SIZE_MISMATCH'],
            ]) {
                bodies[name] = mk()
                let cd = path.join(cacheDir, `${name}-${label.replace(/\W+/g, '_')}`)
                let err = await ensureBins({ fetch: fetchLocal, cacheDir: cd, mirror: '', offline: false, maxAttempts: 1, retryDelayMs: 0 })
                    .then(() => null)
                    .catch((e) => e)
                assert.strict.equal(err instanceof Error, true, `${name} ${label}`)
                assert.strict.equal(err.code, code, `${name} ${label}: ${err && err.message}`)
                assert.strict.equal(err.message.includes(name), true, `${name} ${label}: message should name the file`)
                assert.strict.deepStrictEqual(listFiles(cd), [], `${name} ${label}`) //組內其餘檔亦不留(整組原子發布)
                assert.strict.equal(fs.existsSync(path.join(cd, id)), false, `${name} ${label}: no group folder`)
                bodies[name] = bytesOf[name]
            }
        }
    })

    it(`T5: W_BIN_MIRROR (local folder) is used before GitHub for the whole group, and the mirror copy is verified (M6, O1, O2)`, async function() {
        let fdMirror = path.join(fdt, `mirror${seq}`)
        let fdGroup = putMirrorBundle(fdMirror)
        assert.strict.equal(fdGroup, path.join(fdMirror, manifest.pkg, id)) //鏡像結構: <鏡像>/<套件>/<組識別>/<path>
        process.env.W_BIN_MIRROR = fdMirror

        //鏡像命中: 不連網
        let r = await ensureBins({ fetch: noNet, cacheDir, offline: false })
        assert.strict.equal(r.mseed2ascii, path.join(cacheDir, id))
        verifyGroup(r.mseed2ascii)
        assert.strict.equal(nNet, 0)
        assert.strict.deepStrictEqual(listFiles(cacheDir), groupFiles(cacheDir))
        assert.strict.equal(fs.existsSync(path.join(fdGroup, 'mseed2ascii.exe')), true) //鏡像本身不動
    })

    it(`T5: a tampered mirror file is never used; online the group is completed from GitHub, offline it is E_OFFLINE_MISSING (M6, O2, O3)`, async function() {
        for (let name of names) {
            let fdMirror = path.join(fdt, `mirror${seq}-${name}`)
            let fdGroup = putMirrorBundle(fdMirror)
            fs.writeFileSync(path.join(fdGroup, name), badOf(name)) //組內一檔同大小而內容不同
            process.env.W_BIN_MIRROR = fdMirror

            //連網時: 拒用被竄改之鏡像檔, 自GitHub取得正確之檔, 結果整組皆正確
            urls.length = 0
            let cd = path.join(cacheDir, `online-${name}`)
            let r = await ensureBins({ fetch: fetchLocal, cacheDir: cd, offline: false })
            verifyGroup(r.mseed2ascii)
            assert.strict.equal(urls.includes(urlOf[name]), true, `${name}: the tampered file should be fetched from GitHub`)

            //離線時: 鏡像是唯一來源, 其不符即視為缺檔, 整組不留
            let cd2 = path.join(cacheDir, `offline-${name}`)
            nNet = 0
            let err = await ensureBins({ fetch: noNet, cacheDir: cd2, offline: true })
                .then(() => null)
                .catch((e) => e)
            assert.strict.equal(err && err.code, 'E_OFFLINE_MISSING', `${name}: ${err && err.message}`)
            assert.strict.equal(nNet, 0)
            assert.strict.deepStrictEqual(listFiles(cd2), [], name)
            assert.strict.equal(fs.existsSync(path.join(cd2, id)), false, name)
        }
    })

    it(`T6: W_BIN_OFFLINE=1 without cache or mirror is E_OFFLINE_MISSING listing the whole group: every file, sha256, size and the group folder to place them in (M6, O3, D3)`, async function() {
        process.env.W_BIN_OFFLINE = '1'
        process.env.W_BIN_CACHE = path.join(fdt, `shared${seq}`)
        let err = await ensureBins({ fetch: noNet })
            .then(() => null)
            .catch((e) => e)
        assert.strict.equal(err instanceof Error, true)
        assert.strict.equal(err.code, 'E_OFFLINE_MISSING', err.message)
        assert.strict.equal(nNet, 0)
        assert.strict.equal(urls.length, 0)

        //D3: 共用快取之結構為<W_BIN_CACHE>/<套件>/<組識別>/; 缺檔整組列出
        let m = err.missing[0]
        assert.strict.equal(m.name, 'mseed2ascii')
        assert.strict.equal(m.cachePath, path.join(process.env.W_BIN_CACHE, manifest.pkg, id))
        assert.strict.deepStrictEqual(m.bundle.files.map((v) => v.path).sort(), [...names].sort())
        assert.strict.equal(m.bundle.id, id)
        for (let f of b.files) {
            let ef = m.bundle.files.find((v) => v.path === f.path)
            assert.strict.equal(ef.sha256, f.sha256)
            assert.strict.equal(ef.size, f.size)
            for (let s of [f.path, f.sha256, String(f.size)]) {
                assert.strict.equal(err.message.includes(s), true, `message should include [${s}]`)
            }
        }
        assert.strict.equal(err.message.includes(m.cachePath), true, `message should include the group folder`)
        assert.strict.equal(fs.existsSync(process.env.W_BIN_CACHE), false) //離線缺檔不建任何夾
    })

    it(`T6: with an offline mirror configured, the error also names the mirror group folder (M6, O3, O1)`, async function() {
        let fdMirror = path.join(fdt, `mirror${seq}`) //不存在之鏡像
        let err = await ensureBins({ fetch: noNet, cacheDir, mirror: fdMirror, offline: true })
            .then(() => null)
            .catch((e) => e)
        assert.strict.equal(err && err.code, 'E_OFFLINE_MISSING', err && err.message)
        let fpMirror = path.join(fdMirror, manifest.pkg, id)
        assert.strict.equal(err.missing[0].mirrorPath, fpMirror)
        assert.strict.equal(err.message.includes(fpMirror), true)
    })

    it(`T6: offline with a cache missing one file of the group lists the whole group, not just the missing file (M6, O3)`, async function() {
        let fd = path.join(cacheDir, id)
        for (let f of b.files) {
            if (f.path !== 'cygz.dll') {
                fs.mkdirSync(fd, { recursive: true })
                fs.copyFileSync(path.join(b.dir, f.path), path.join(fd, f.path))
            }
        }
        let err = await ensureBins({ fetch: noNet, cacheDir, mirror: '', offline: true })
            .then(() => null)
            .catch((e) => e)
        assert.strict.equal(err && err.code, 'E_OFFLINE_MISSING', err && err.message)
        assert.strict.equal(nNet, 0)
        for (let n of names) {
            assert.strict.equal(err.message.includes(n), true, `message should list [${n}]`) //存在之檔亦列出(須整組備妥)
        }
        assert.strict.deepStrictEqual(err.missing[0].bundle.files.map((v) => v.path).sort(), [...names].sort()) //錯誤物件亦列全組
        assert.strict.equal(err.missing[0].cachePath, fd) //應放之位置為組資料夾
        assert.strict.equal(err.message.includes(fd), true)
        assert.strict.equal(fs.existsSync(path.join(fd, 'cygz.dll')), false) //離線失敗不補檔
    })

    it(`T7: a tampered, truncated or deleted file in the cached group is refused and the whole group is fetched again (D4, M6)`, async function() {
        let r = await ensureBins({ fetch: fetchLocal, cacheDir, mirror: '', offline: false })
        let fd = r.mseed2ascii
        assert.strict.equal(urls.length, 3)

        for (let name of names) {
            for (let [label, op] of [
                ['same size, different content', (fp) => fs.writeFileSync(fp, badOf(name))],
                ['truncated', (fp) => fs.writeFileSync(fp, bytesOf[name].subarray(0, 100))],
                ['deleted', (fp) => fs.rmSync(fp)],
            ]) {
                let fp = path.join(fd, name)
                op(fp)
                if (fs.existsSync(fp)) {
                    fs.utimesSync(fp, 1, 1)
                }
                let n0 = urls.length
                let r2 = await ensureBins({ fetch: fetchLocal, cacheDir, mirror: '', offline: false })
                assert.strict.equal(r2.mseed2ascii, fd, `${name} ${label}`)
                verifyGroup(fd)
                assert.strict.equal(urls.length - n0, 3, `${name} ${label}: the whole group should be fetched again`)
                assert.strict.deepStrictEqual(listFiles(cacheDir), groupFiles(cacheDir), `${name} ${label}`)
            }
        }
    })

    it(`T7: offline, a tampered file in the cached group is never returned (D4, O3, M6)`, async function() {
        let r = await ensureBins({ fetch: fetchLocal, cacheDir, mirror: '', offline: false })
        let fp = path.join(r.mseed2ascii, 'cygwin1.dll')
        fs.writeFileSync(fp, badOf('cygwin1.dll'))
        fs.utimesSync(fp, 1, 1)
        let err = await ensureBins({ fetch: noNet, cacheDir, mirror: '', offline: true })
            .then(() => null)
            .catch((e) => e)
        assert.strict.equal(err && err.code, 'E_OFFLINE_MISSING', err && err.message)
        assert.strict.equal(nNet, 0)
    })

    it(`does not forward a user-given floatingManifestUrl (the pinned manifest has no trunk to redirect) (E2)`, async function() {
        for (let v of ['not a url', 'https://evil.example/x/manifest.json', 'http://127.0.0.1:1/manifest.json']) {
            let cd = path.join(cacheDir, `f${urls.length}-${v.length}`)
            let r = await ensureBins({ floatingManifestUrl: v, fetch: fetchLocal, cacheDir: cd, mirror: '', offline: false })
            verifyGroup(r.mseed2ascii)
        }
    })

    it(`derives the package root from the module location, not from the working directory (D3, E2)`, function() {
        //子行程於他處工作目錄載入並離線呼叫: 預設快取位置須在本套件根之bin-cache/下
        let fdElse = fs.mkdtempSync(path.join(os.tmpdir(), 'wdm-cwd-'))
        let out = null
        try {
            let s = execFileSync(process.execPath, [path.resolve('test/tools/childCwd.mjs'), path.resolve('src/ensureBins.mjs')], { cwd: fdElse, encoding: 'utf8', windowsHide: true })
            out = JSON.parse(s)
        }
        finally {
            fs.rmSync(fdElse, { recursive: true, force: true })
        }
        assert.strict.equal(path.resolve(out.cwd).toLowerCase(), path.resolve(fdElse).toLowerCase()) //確認子行程確實在他處
        assert.strict.equal(out.code, 'E_OFFLINE_MISSING', out.message)
        assert.strict.equal(out.cachePath, path.join(path.resolve('.'), 'bin-cache', id))
    })

    it(`is exposed as a static property of the default export (UMD stays unchanged) and the module has no named export (E2)`, function() {
        assert.strict.equal(nsWDataMseed.default.ensureBins, ensureBins)
        assert.strict.deepStrictEqual(Object.keys(nsWDataMseed), ['default'])
    })

})
