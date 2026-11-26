import fs from 'fs'
import path from 'path'
import assert from 'assert'
import wds from '../src/WDataMseed.mjs'
import { setBinEnv } from './tools/binEnv.mjs'


function isWindows() {
    return process.platform === 'win32'
}


//規格對應(R-LIST-LEVEL, 輸出夾列舉層數):
//  S1. 轉檔後僅列舉輸出夾(fdOut)之第1層, 輸出夾下子資料夾內之檔不得被當成輸出檔回傳(wsemi 1.9.80起fsTreeFolder未給levelLimit即窮舉全部層級, 須明寫{ levelLimit: 1 })
//  S2. 第1層之輸出檔(mseed2ascii實際產出之csv)仍全數回傳
//  S3. 列舉不得因wsemi列舉函數之opt簽章而失敗(舊寫法以數字為第2參數, 於wsemi 1.9.80起拋invalid opt, 本函數以try/catch吞掉後會誤報為無輸出檔)
//mseed2ascii只於工作路徑平放輸出, 實際不會產生子資料夾, 故於輸出夾被列舉當下(首次對該夾之fs.readdirSync)注入子夾與其內之檔, 並記錄列舉所讀之路徑(窮舉會續讀子夾, 第1層不會)
describe(`WDataMseed (listing level of the output folder)`, function() {
    this.timeout(180000)

    //check
    if (!isWindows()) {
        return
    }

    let env = null
    let fdt = ''
    let fdOutPre = ''
    let fpHead = ''

    let readdirOri = fs.readdirSync
    let inject = false
    let injected = ''
    let reads = []

    //isUnder, 路徑p是否位於資料夾fd之下(不含fd本身)
    let isUnder = (p, fd) => {
        let rel = path.relative(fd, p)
        return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
    }

    before(function() {
        env = setBinEnv('WDataMseedLevel')
        fdt = env.fdt
        fdOutPre = path.join(fdt, 'out', '_')
        fs.mkdirSync(path.join(fdt, 'out'), { recursive: true })

        //輸入: 取g.mseed開頭200筆記錄
        fs.mkdirSync(path.join(fdt, 'in'), { recursive: true })
        fpHead = path.join(fdt, 'in', 'head.mseed')
        fs.writeFileSync(fpHead, fs.readFileSync(path.resolve('./test/g.mseed')).subarray(0, 200 * 512))

        //攔截fs.readdirSync(wsemi之列舉函數以Node內建之fs注入, 與此為同一物件): 記錄本測試輸出夾區之讀取, 並於輸出夾首次被讀時注入子夾
        fs.readdirSync = function(p, ...rest) {
            let rp = path.resolve(String(p))
            if (isUnder(rp, path.join(fdt, 'out'))) {
                reads.push(rp)
                if (inject && injected === '' && path.dirname(rp) === path.join(fdt, 'out')) {
                    injected = rp
                    fs.mkdirSync(path.join(rp, 'sub', 'deeper'), { recursive: true })
                    fs.writeFileSync(path.join(rp, 'sub', 'n1.csv'), 'n1')
                    fs.writeFileSync(path.join(rp, 'sub', 'deeper', 'n2.csv'), 'n2')
                }
            }
            return readdirOri.call(this, p, ...rest)
        }
    })

    after(function() {
        fs.readdirSync = readdirOri
        env.restore()
    })

    beforeEach(function() {
        inject = false
        injected = ''
        reads = []
        fs.rmSync(path.join(fdt, 'out'), { recursive: true, force: true })
        fs.mkdirSync(path.join(fdt, 'out'), { recursive: true })
    })

    it(`lists only the first level of the output folder: files in sub folders are not returned and sub folders are not read`, async function() {

        //對照: 不注入子夾, 取得mseed2ascii實際輸出之檔名
        let rs0 = await wds(fpHead, { fdOutPre, readWithData: false })
        let names0 = rs0.map((v) => v.name).sort()
        assert.ok(names0.length > 0, 'control run must produce output files')
        fs.rmSync(path.join(fdt, 'out'), { recursive: true, force: true })
        fs.mkdirSync(path.join(fdt, 'out'), { recursive: true })
        reads = []

        //注入子夾後再轉一次
        inject = true
        let rs = await wds(fpHead, { fdOutPre, readWithData: false })
        inject = false

        //注入確實發生(否則下列斷言不具鑑別力)
        assert.ok(injected !== '', 'sub folder must have been injected')
        assert.ok(fs.existsSync(path.join(injected, 'sub', 'n1.csv')), 'injected file must exist')
        assert.ok(fs.existsSync(path.join(injected, 'sub', 'deeper', 'n2.csv')), 'injected deeper file must exist')

        //S2, S3, 第1層之輸出檔全數回傳(子夾本身之項目不計)
        let names = rs.map((v) => v.name).sort()
        let namesOut = names.filter((v) => v !== 'sub')
        assert.deepStrictEqual(namesOut, names0)

        //S1, 子層之檔與更深之夾不得回傳
        assert.ok(!names.includes('n1.csv'), 'nested file n1.csv must not be returned')
        assert.ok(!names.includes('n2.csv'), 'deeper nested file n2.csv must not be returned')
        assert.ok(!names.includes('deeper'), 'deeper folder must not be returned')

        //S1, 列舉讀了輸出夾本身, 沒讀其子夾
        let nRoot = reads.filter((p) => p === injected).length
        let nSub = reads.filter((p) => isUnder(p, injected)).length
        assert.ok(nRoot >= 1, 'the output folder must be read')
        assert.ok(nSub === 0, `sub folders of the output folder must not be read, got ${nSub}`)

        fs.rmSync(injected, { recursive: true, force: true })
    })

})
