import fs from 'fs'
import os from 'os'
import path from 'path'
import assert from 'assert'
import cp from 'child_process'
import { EventEmitter } from 'events'
import wds from '../src/WDataMseed.mjs'
import { setBinEnv } from './tools/binEnv.mjs'


function isWindows() {
    return process.platform === 'win32'
}


//規格: 外部執行檔之存放下載校驗與離線(制式規格) E2、D3、D4、O3、M6、§9(主函數類入口之測試: 攔截全域fetch、攔截child_process.spawn、套件根與cwd無關、交換檔不寫執行檔所在夾)
//主函數無法注入fetch, 故以W_BIN_MIRROR(本地資料夾)＋W_BIN_OFFLINE=1取得實檔, 並攔截全域fetch斷言未被呼叫; 真exe實際轉換
describe(`WDataMseed (executable obtained by ensureBins)`, function() {
    this.timeout(180000)

    //check
    if (!isWindows()) {
        return
    }

    let env = null
    let fdt = ''
    let fdOutPre = ''
    let cwdOri = process.cwd()
    let golden = JSON.parse(fs.readFileSync('./test/g.json', 'utf8'))

    let fetchOri = globalThis.fetch
    let nFetch = 0

    let spawnOri = cp.spawn
    let calls = []

    let fpFull = path.resolve('./test/g.mseed')
    let fpHead = ''
    let fpTail = ''

    //oracle, 獨立於被測函數: 直接以repo bin/內之exe於專屬資料夾轉檔(spawnSync不受spawn攔截影響), 自輸出檔取名稱、SID、樣本數與首末樣本
    let seqOracle = 0
    let oracle = (fpIn) => {
        let fd = path.join(fdt, `oracle${seqOracle++}`)
        fs.mkdirSync(fd, { recursive: true })
        let r = cp.spawnSync(path.resolve('bin/mseed2ascii/mseed2ascii.exe'), ['-G', fpIn], { cwd: fd, windowsHide: true })
        assert.strict.equal(r.status, 0)
        return fs.readdirSync(fd).sort().map((name) => {
            let lines = fs.readFileSync(path.join(fd, name), 'utf8').split(/\r?\n/)
            let iSample = lines.findIndex((v) => v === 'Sample')
            let ds = lines.slice(iSample + 1).filter((v) => v !== '').map(Number)
            return {
                name,
                SID: lines.find((v) => v.startsWith('# SID: ')).replace('# SID: ', ''),
                count: Number(lines.find((v) => v.startsWith('# sample_count: ')).replace('# sample_count: ', '')),
                n: ds.length,
                first: ds[0],
                last: ds[ds.length - 1],
            }
        })
    }

    //outDirs, 輸出夾之上層(fdOutPre所在)現有之子資料夾; rmNew刪除相對於before新增者
    let outDirs = () => {
        return fs.readdirSync(path.join(fdt, 'out')).map((v) => path.join(fdt, 'out', v))
    }
    let rmNew = (before) => {
        for (let fd of outDirs()) {
            if (!before.includes(fd)) {
                fs.rmSync(fd, { recursive: true, force: true })
            }
        }
    }

    let summary = (rs) => {
        return rs.map((v) => ({
            name: v.name,
            SID: v.data.heads.SID,
            count: Number(v.data.heads.sample_count),
            n: v.data.records.length,
            first: v.data.records[0],
            last: v.data.records[v.data.records.length - 1],
        }))
    }

    before(function() {
        env = setBinEnv('WDataMseed')
        fdt = env.fdt
        fdOutPre = path.join(fdt, 'out', '_')
        fs.mkdirSync(path.join(fdt, 'out'), { recursive: true })

        //另備兩個內容不同之輸入: 開頭200筆記錄(HNE)與結尾200筆記錄(HNZ)
        let g = fs.readFileSync(fpFull)
        fs.mkdirSync(path.join(fdt, 'in'), { recursive: true })
        fpHead = path.join(fdt, 'in', 'head.mseed')
        fpTail = path.join(fdt, 'in', 'tail.mseed')
        fs.writeFileSync(fpHead, g.subarray(0, 200 * 512))
        fs.writeFileSync(fpTail, g.subarray(g.length - 200 * 512))

        //攔截全域fetch: 被呼叫即代表連網(主函數無法注入fetch, 回歸為直連時須使測試變紅而非因真網路而綠)
        globalThis.fetch = (...a) => {
            nFetch++
            return Promise.reject(new Error(`fetch must not be called: ${String(a[0])}`))
        }
    })

    after(function() {
        globalThis.fetch = fetchOri
        cp.spawn = spawnOri
        env.restore()
    })

    beforeEach(function() {
        nFetch = 0
        calls = []
        //攔截child_process.spawn: 記錄啟動者(prog、args、選項)與當時之process.cwd(), 並照常啟動
        cp.spawn = function(prog, args, opt, ...rest) {
            calls.push({ prog, args, opt, cwdAtSpawn: process.cwd() })
            return spawnOri.call(this, prog, args, opt, ...rest)
        }
    })

    afterEach(function() {
        cp.spawn = spawnOri
        assert.strict.equal(process.cwd(), cwdOri) //任何情形下呼叫端之工作路徑皆不變
    })

    it(`converts test/g.mseed to the golden result using the exe inside the verified cache group, without network (E2, D3, M6)`, async function() {
        let rr = await wds(fpFull, { fdOutPre })
        assert.strict.deepEqual(rr, golden)

        //啟動者須為ensureBins回傳之組資料夾內之exe(組識別由測試獨立計算); 其旁有兩個dll
        assert.strict.equal(calls.length, 1)
        let c = calls[0]
        assert.strict.equal(path.resolve(c.prog), path.join(env.groupDir, 'mseed2ascii.exe'))
        for (let n of ['cygwin1.dll', 'cygz.dll']) {
            assert.strict.equal(fs.existsSync(path.join(path.dirname(c.prog), n)), true, n)
        }
        //不是repo內bin/、舊路徑mseed2ascii-2.6/或node_modules內之檔
        for (let fd of [path.resolve('bin'), path.resolve('mseed2ascii-2.6')]) {
            assert.strict.equal(path.resolve(c.prog).toLowerCase().startsWith(fd.toLowerCase() + path.sep), false, fd)
        }
        assert.strict.equal(/node_modules/i.test(c.prog), false)

        //以子行程之cwd指定輸出夾(mseed2ascii預設把輸出檔寫在工作路徑), 不改本行程之工作路徑
        assert.strict.equal(c.args[0], '-G')
        assert.strict.equal(path.basename(c.args[1]), 'temp.mseed')
        assert.strict.equal(c.opt.cwd, path.dirname(c.args[1]))
        assert.strict.equal(path.dirname(c.opt.cwd), path.dirname(fdOutPre)) //輸出夾在呼叫端指定之fdOutPre下
        assert.strict.equal(c.opt.windowsHide, true)
        assert.strict.equal(c.cwdAtSpawn, cwdOri)
        assert.strict.equal(nFetch, 0)

        //資料交換夾(輸出夾)已刪, 執行檔所在夾內無任何新檔
        assert.strict.equal(fs.existsSync(c.opt.cwd), false)
        assert.strict.deepStrictEqual(fs.readdirSync(env.groupDir).sort(), ['cygwin1.dll', 'cygz.dll', 'mseed2ascii.exe'])
    })

    it(`runs two conversions at the same time: each output is correct, each child has its own output folder and process.cwd() never changes (cwd option instead of process.chdir)`, async function() {
        let expHead = oracle(fpHead)
        let expTail = oracle(fpTail)
        let expFull = oracle(fpFull)
        assert.strict.notDeepEqual(expHead.map((v) => v.name), expTail.map((v) => v.name)) //兩輸入之channel不同, 輸出檔名不同

        let cwds = []
        let timer = setInterval(() => {
            cwds.push(process.cwd())
        }, 1)
        let rs = null
        try {
            rs = await Promise.all([
                wds(fpHead, { fdOutPre }),
                wds(fpTail, { fdOutPre }),
                wds(fpFull, { fdOutPre }),
            ])
        }
        finally {
            clearInterval(timer)
        }
        assert.strict.deepStrictEqual(summary(rs[0]), expHead)
        assert.strict.deepStrictEqual(summary(rs[1]), expTail)
        assert.strict.deepStrictEqual(summary(rs[2]), expFull)
        assert.strict.deepEqual(rs[2], golden)

        //啟動3個子行程, 各自在不同之輸出夾, 且啟動當時與併發期間之process.cwd()皆未改變
        assert.strict.equal(calls.length, 3)
        assert.strict.equal(new Set(calls.map((v) => v.opt.cwd)).size, 3)
        assert.strict.deepStrictEqual(calls.map((v) => v.cwdAtSpawn), [cwdOri, cwdOri, cwdOri])
        assert.strict.deepStrictEqual([...new Set(cwds)].filter((v) => v !== cwdOri), [])
        assert.strict.equal(nFetch, 0)
    })

    it(`returns the output files (readWithData=false) written in the output folder, process.cwd() unchanged`, async function() {
        let before = outDirs()
        try {
            let rs = await wds(fpHead, { fdOutPre, readWithData: false })
            assert.strict.deepStrictEqual(rs.map((v) => v.name), oracle(fpHead).map((v) => v.name))
            assert.strict.equal(calls.length, 1)
            for (let v of rs) {
                assert.strict.equal(fs.existsSync(v.path), true)
                assert.strict.equal(path.dirname(v.path), calls[0].opt.cwd) //輸出落在子行程之cwd, 而非呼叫端之工作路徑
                assert.strict.equal(fs.readFileSync(v.path, 'utf8').startsWith('# dataset: GeoCSV 2.0'), true)
                assert.strict.equal(v.data, null)
            }
            assert.strict.deepStrictEqual(fs.readdirSync(cwdOri).filter((v) => /\.csv$/.test(v)), []) //專案根無輸出檔
        }
        finally {
            rmNew(before)
        }
    })

    it(`rejects with the message of mseed2ascii when the input is not miniSEED, keeping the output folder for inspection and naming its absolute path in the message`, async function() {
        let fpBad = path.join(fdt, 'in', 'bad.mseed')
        fs.writeFileSync(fpBad, 'not mseed\n')
        let before = outDirs()
        try {
            let err = await wds(fpBad, { fdOutPre })
                .then(() => null, (e) => ({ e }))
            assert.strict.notEqual(err, null) //須reject
            assert.strict.equal(typeof err.e, 'string') //說明字串(原為null, 錯誤訊息遺失)
            assert.strict.equal(err.e.includes('No SEED data detected'), true, String(err.e))
            assert.strict.equal(outDirs().length - before.length, 1) //保留輸出夾供查找
            assert.strict.equal(calls.length, 1)
            assert.strict.equal(fs.existsSync(calls[0].opt.cwd), true)
            assert.strict.equal(err.e.includes(calls[0].opt.cwd), true, String(err.e)) //訊息含保留夾之絕對路徑(呼叫端才找得到)
            assert.strict.equal(path.isAbsolute(calls[0].opt.cwd), true)
        }
        finally {
            rmNew(before)
        }
    })

    it(`rejects before creating any output folder when the executable can not be obtained offline (E3, O3), and never falls back to the files in the repo`, async function() {
        let bkCache = process.env.W_BIN_CACHE
        let bkMirror = process.env.W_BIN_MIRROR
        process.env.W_BIN_CACHE = path.join(fdt, 'cache-empty')
        process.env.W_BIN_MIRROR = path.join(fdt, 'mirror-empty')
        let n0 = fs.readdirSync(path.join(fdt, 'out')).length
        try {
            let err = await wds(fpHead, { fdOutPre })
                .then(() => null, (e) => ({ e }))
            assert.strict.equal(typeof err.e, 'string')
            assert.strict.equal(err.e.includes('E_OFFLINE_MISSING'), true, err.e)
            assert.strict.equal(err.e.includes('mseed2ascii.exe'), true, err.e)
            assert.strict.equal(err.e.includes('cygwin1.dll'), true, err.e) //列出全組
        }
        finally {
            process.env.W_BIN_CACHE = bkCache
            process.env.W_BIN_MIRROR = bkMirror
        }
        assert.strict.equal(calls.length, 0) //未啟動任何子行程
        assert.strict.equal(fs.readdirSync(path.join(fdt, 'out')).length, n0) //未建輸出夾
        assert.strict.equal(nFetch, 0)
    })

    //以假子行程驗證外部執行檔(wsemi execProcess啟動)之各失敗分支(不啟動真exe): 同步拋錯、error事件、離開碼非0; 皆reject帶prefix之說明字串(execProcess之格式), 並保留輸出夾, 訊息末行附其絕對路徑
    let fakeChild = (fn) => {
        let ee = new EventEmitter()
        ee.stdout = new EventEmitter()
        ee.stderr = new EventEmitter()
        setImmediate(() => fn(ee))
        return ee
    }
    //rejectWith回傳{ e, fd }: e為reject之字串, fd為保留之輸出夾; 呼叫端以全文相等斷言(prefix與夾行皆在內)
    let rejectWith = async (fnSpawn) => {
        let before = outDirs()
        try {
            cp.spawn = fnSpawn
            let err = await wds(fpHead, { fdOutPre })
                .then(() => null, (e) => ({ e }))
            assert.strict.notEqual(err, null)
            assert.strict.equal(typeof err.e, 'string')
            assert.strict.equal(outDirs().length - before.length, 1) //保留輸出夾供查找
            let fd = outDirs().find((v) => !before.includes(v))
            assert.strict.equal(err.e.includes(fd), true, String(err.e)) //訊息含保留夾之絕對路徑
            return { e: err.e, fd }
        }
        finally {
            rmNew(before)
        }
    }
    let lineKept = (fd) => `output folder kept for inspection: ${fd}`

    it(`rejects with spawn[code] when the child process can not be created (throws synchronously or emits error)`, async function() {
        let r1 = await rejectWith(() => {
            throw Object.assign(new Error('boom'), { code: 'EPERM' })
        })
        assert.strict.equal(r1.e, `spawn[EPERM]:\nboom\n${lineKept(r1.fd)}`)

        let r2 = await rejectWith(() => fakeChild((ee) => {
            ee.emit('error', Object.assign(new Error('not found'), { code: 'ENOENT' }))
            ee.emit('close', -2) //error之後node可能仍發出close, 不得改變結果
        }))
        assert.strict.equal(r2.e, `spawn[ENOENT]:\nnot found\n${lineKept(r2.fd)}`) //cwd(輸出夾)存在, 故訊息不改指cwd
    })

    it(`rejects with code[N] and the output of the child when it exits with a non-zero code and writes no file`, async function() {
        let r = await rejectWith(() => fakeChild((ee) => {
            ee.stderr.emit('data', Buffer.from('fake '))
            ee.stdout.emit('data', Buffer.from('failure'))
            ee.emit('close', 3)
        }))
        assert.strict.equal(r.e, `code[3]:\nfake failure\n${lineKept(r.fd)}`) //輸出依到達順序合併
    })

    it(`rejects with the output of the child when it exits with code 0 and writes no file (the output is the only message)`, async function() {
        let r = await rejectWith(() => fakeChild((ee) => {
            ee.stderr.emit('data', Buffer.from('Error reading x: No SEED data detected\n'))
            ee.emit('close', 0)
        }))
        assert.strict.equal(r.e, `Error reading x: No SEED data detected\n\n${lineKept(r.fd)}`)
    })

    it(`rejects with spawn[ENOENT] naming the cwd when the output folder is gone before the child starts, and never changes process.cwd()`, async function() {
        let before = outDirs()
        let cwdSpawn = ''
        try {
            //啟動前使輸出夾消失(真spawn以不存在之cwd啟動): execProcess把ENOENT改指cwd, 不指向執行檔
            cp.spawn = function(prog, args, opt, ...rest) {
                cwdSpawn = opt.cwd
                fs.rmSync(opt.cwd, { recursive: true, force: true })
                return spawnOri.call(this, prog, args, opt, ...rest)
            }
            let err = await wds(fpHead, { fdOutPre })
                .then(() => null, (e) => ({ e }))
            assert.strict.notEqual(err, null) //須reject
            assert.strict.equal(typeof err.e, 'string')
            assert.strict.equal(path.isAbsolute(cwdSpawn), true)
            assert.strict.equal(fs.existsSync(cwdSpawn), false)
            assert.strict.equal(err.e.startsWith(`spawn[ENOENT]:\ncwd is not an existing folder: ${cwdSpawn}\n`), true, err.e)
            assert.strict.equal(err.e.includes('mseed2ascii.exe'), false, err.e) //不指向執行檔
            assert.strict.equal(process.cwd(), cwdOri)
        }
        finally {
            rmNew(before)
        }
    })

    //os.tmpdir()讀取TEMP與TMP, 故以環境變數把暫存夾導向測試專用夾(子行程以env傳入; 本行程於測試內暫改並還原), 才能精確斷言輸出夾落點而不受系統暫存夾內他人之檔干擾
    let runChild = (fpIn, fdCwd, fdTmp) => {
        let s = cp.execFileSync(process.execPath, [path.resolve('test/tools/childConvert.mjs'), path.resolve('src/WDataMseed.mjs'), fpIn], {
            cwd: fdCwd,
            encoding: 'utf8',
            windowsHide: true,
            env: { ...process.env, TEMP: fdTmp, TMP: fdTmp },
        })
        return JSON.parse(s.slice(s.lastIndexOf('#RESULT#') + '#RESULT#'.length))
    }
    let sameDir = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
    let withTmp = async (name, fn) => {
        let fdTmp = path.join(fdt, name)
        fs.mkdirSync(fdTmp, { recursive: true })
        let bk = { TEMP: process.env.TEMP, TMP: process.env.TMP }
        process.env.TEMP = fdTmp
        process.env.TMP = fdTmp
        try {
            assert.strict.equal(sameDir(os.tmpdir(), fdTmp), true) //前提: os.tmpdir()隨TEMP/TMP改變
            return await fn(fdTmp)
        }
        finally {
            for (let k of Object.keys(bk)) {
                if (bk[k] === undefined) {
                    delete process.env[k]
                }
                else {
                    process.env[k] = bk[k]
                }
            }
        }
    }

    it(`works when loaded and called from another working directory: the output folder is created in os.tmpdir() (not in the working directory of the caller) and removed afterwards`, function() {
        //子行程於他處工作目錄載入主函數並轉檔, 執行檔經ensureBins由套件根外之W_BIN_CACHE/W_BIN_MIRROR取得
        let fdElse = path.join(fdt, 'cwd-ok')
        let fdTmp = path.join(fdt, 'os-tmp-ok')
        fs.mkdirSync(fdElse, { recursive: true })
        fs.mkdirSync(fdTmp, { recursive: true })
        let out = runChild(fpHead, fdElse, fdTmp)
        assert.strict.equal(sameDir(out.cwd, fdElse), true)
        assert.strict.equal(sameDir(out.tmpdir, fdTmp), true) //前提: 子行程之os.tmpdir()即測試專用夾
        assert.strict.equal(out.err, null)
        assert.strict.equal(out.cwdAfter, out.cwd)
        assert.strict.deepStrictEqual(out.names, oracle(fpHead).map((v) => v.name))
        assert.strict.deepStrictEqual(out.counts, oracle(fpHead).map((v) => v.n))

        //輸出夾(啟動子行程時之cwd)建於os.tmpdir()下, 夾名前綴為預設之'_'; 呼叫端之工作路徑內無任何檔
        assert.strict.equal(out.spawnCwds.length, 1)
        assert.strict.equal(path.isAbsolute(out.spawnCwds[0]), true)
        assert.strict.equal(sameDir(path.dirname(out.spawnCwds[0]), fdTmp), true, out.spawnCwds[0])
        assert.strict.equal(path.basename(out.spawnCwds[0]).startsWith('_'), true)
        assert.strict.deepStrictEqual(fs.readdirSync(fdElse), [])

        //成功時暫存夾已刪除, os.tmpdir()內不留殘餘
        assert.strict.equal(fs.existsSync(out.spawnCwds[0]), false)
        assert.strict.deepStrictEqual(fs.readdirSync(fdTmp), [])
    })

    it(`fails from another working directory: nothing appears in the working directory of the caller, the output folder is kept in os.tmpdir() and the reject message names its absolute path`, function() {
        let fpBad = path.join(fdt, 'in', 'bad2.mseed')
        fs.writeFileSync(fpBad, 'not mseed\n')
        let fdElse = path.join(fdt, 'cwd-ng')
        let fdTmp = path.join(fdt, 'os-tmp-ng')
        fs.mkdirSync(fdElse, { recursive: true })
        fs.mkdirSync(fdTmp, { recursive: true })
        let out = runChild(fpBad, fdElse, fdTmp)
        assert.strict.equal(typeof out.err, 'string')
        assert.strict.equal(out.err.includes('No SEED data detected'), true, out.err)
        assert.strict.equal(out.spawnCwds.length, 1)
        let fd = out.spawnCwds[0]

        //保留夾: 在os.tmpdir()下、存在、含輸入副本; 呼叫端之工作路徑內無任何檔; 訊息含其絕對路徑
        assert.strict.equal(sameDir(path.dirname(fd), fdTmp), true, fd)
        assert.strict.equal(fs.existsSync(fd), true)
        assert.strict.equal(fs.existsSync(path.join(fd, 'temp.mseed')), true)
        assert.strict.deepStrictEqual(fs.readdirSync(fdTmp), [path.basename(fd)])
        assert.strict.deepStrictEqual(fs.readdirSync(fdElse), [])
        assert.strict.equal(path.isAbsolute(fd), true)
        assert.strict.equal(out.err.includes(fd), true, out.err)
    })

    it(`creates the output folder in os.tmpdir() with the prefix fdOutPre (default '_'), never in the working directory of the caller, and keeps the files when readWithData=false`, async function() {
        await withTmp('os-tmp-in', async (fdTmp) => {
            let names = fs.readdirSync(cwdOri)
            let seen = []
            let rs = await wds(fpHead) //預設fdOutPre
            assert.strict.equal(rs.length > 0, true)
            seen.push(calls[0].opt.cwd)
            assert.strict.equal(sameDir(path.dirname(calls[0].opt.cwd), fdTmp), true, calls[0].opt.cwd)
            assert.strict.equal(path.basename(calls[0].opt.cwd).startsWith('_'), true)
            assert.strict.equal(fs.existsSync(calls[0].opt.cwd), false) //成功(readWithData=true)已刪
            assert.strict.deepStrictEqual(fs.readdirSync(fdTmp), [])

            //自訂前綴(資料夾名前綴之語意不變)與readWithData=false(輸出夾保留, 回傳檔案位置)
            let rs2 = await wds(fpHead, { fdOutPre: 'pre-', readWithData: false })
            let fd2 = calls[1].opt.cwd
            assert.strict.equal(sameDir(path.dirname(fd2), fdTmp), true, fd2)
            assert.strict.equal(path.basename(fd2).startsWith('pre-'), true)
            assert.strict.equal(rs2.every((v) => sameDir(path.dirname(v.path), fd2) && fs.existsSync(v.path)), true)

            //呼叫端之工作路徑(專案根)內無任何新檔
            assert.strict.deepStrictEqual(fs.readdirSync(cwdOri), names)
            fs.rmSync(fd2, { recursive: true, force: true })
        })
    })

    it(`names the absolute path of the kept output folder in every reject after the folder is created (copy error, input missing, no output file)`, async function() {
        await wds.ensureBins() //先取得執行檔, 使下列對fs.copyFileSync之暫改不影響下載與快取
        await withTmp('os-tmp-rej', async (fdTmp) => {
            let copyOri = fs.copyFileSync
            let kinds = [
                ['fsCopyFile error', () => {
                    fs.copyFileSync = () => {
                        throw new Error('copy failed')
                    }
                }],
                ['fpIn is not file', () => {
                    fs.copyFileSync = () => {} //複製無動作, 輸入副本不存在
                }],
            ]
            for (let [msg, patch] of kinds) {
                let before = fs.readdirSync(fdTmp)
                let e = null
                try {
                    patch()
                    e = await wds(fpHead).then(() => null, (err) => ({ err }))
                }
                finally {
                    fs.copyFileSync = copyOri
                }
                assert.strict.notEqual(e, null, msg)
                assert.strict.equal(typeof e.err, 'string')
                assert.strict.equal(e.err.startsWith(msg), true, e.err)
                let kept = fs.readdirSync(fdTmp).filter((v) => !before.includes(v))
                assert.strict.equal(kept.length, 1, msg) //保留夾在os.tmpdir()下
                assert.strict.equal(e.err.includes(path.join(fdTmp, kept[0])), true, e.err)
                assert.strict.equal(calls.length, 0) //未啟動子行程
                fs.rmSync(path.join(fdTmp, kept[0]), { recursive: true, force: true })
            }
        })
    })

})
