import fs from 'fs'
import path from 'path'
import assert from 'assert'
import { execSync, execFileSync } from 'child_process'
import fsGetBinManifestEntry from 'wsemi/src/fsGetBinManifestEntry.mjs'
import fsEnsureBins from 'wsemi/src/fsEnsureBins.mjs'
import { readManifest, bundleId, getBundle } from './tools/binEnv.mjs'


//規格: 外部執行檔之存放下載校驗與離線(制式規格) S1、S2、S5、M1、M2、M4、M6、§8 T1、T2
//本套件為D類(npm包原附執行檔), mseed2ascii.exe須與cygwin1.dll、cygz.dll相鄰, 故以檔案組(M6)宣告
describe(`bin/manifest.json`, function() {
    this.timeout(120000)

    let fdt = './test/_tmp/binManifest'

    after(function() {
        fs.rmSync(fdt, { recursive: true, force: true })
        try {
            fs.rmdirSync('./test/_tmp') //尚有其他測試之暫存時非空, 略過
        }
        catch (err) {}
    })

    let lines = (fn) => {
        return fs.readFileSync(fn, 'utf8').split(/\r?\n/).map((v) => v.trim())
    }

    let walk = (fd) => {
        return fs.readdirSync(fd, { recursive: true, withFileTypes: true })
            .filter((v) => v.isFile())
            .map((v) => path.relative(fd, path.join(v.parentPath, v.name)).split(path.sep).join('/'))
            .sort()
    }

    it(`should pass the schema check of fsEnsureBins (M1, M2, M6)`, async function() {
        //離線且快取為空資料夾: 清單有效時為E_OFFLINE_MISSING(缺檔), 清單無效時為E_MANIFEST; 不連網
        let err = null
        try {
            await fsEnsureBins('bin/manifest.json', { pkgRoot: '.', cacheDir: `${fdt}/cache`, mirror: '', offline: true })
        }
        catch (e) {
            err = e
        }
        assert.strict.equal(err && err.code, 'E_OFFLINE_MISSING', err && err.message)
    })

    it(`should be a pinned manifest of w-data-mseed with one bundle mseed2ascii of 3 files (M1, M6, U1)`, function() {
        let manifest = readManifest()
        //M1: pkg、mode、repo; M2/F15: 釘選模式之自有檔網址ref須為40碼提交
        assert.strict.equal(manifest.pkg, 'w-data-mseed')
        assert.strict.equal(manifest.mode, 'pinned')
        assert.strict.equal(manifest.repo, 'yuda-lyu/w-data-mseed')
        assert.strict.equal(/^[0-9a-f]{40}$/.test(manifest.commit), true, manifest.commit)
        //M6: 檔案組(頂層bundles, 無單檔files)
        assert.strict.equal(manifest.files, undefined)
        assert.strict.deepStrictEqual(manifest.bundles.map((v) => [v.name, v.dir]), [['mseed2ascii', 'bin/mseed2ascii']])
        assert.strict.deepStrictEqual(getBundle(manifest).files.map((v) => v.path), ['cygwin1.dll', 'cygz.dll', 'mseed2ascii.exe'])
    })

    it(`should match the real files in bin/ and list every file there (M4, T2)`, async function() {
        let manifest = readManifest()
        let b = getBundle(manifest)
        for (let f of b.files) {
            let e = await fsGetBinManifestEntry(`${b.dir}/${f.path}`, { name: null, path: f.path })
            assert.strict.deepStrictEqual([e.sha256, e.size], [f.sha256, f.size], f.path)
        }
        //bin/內除清單外只有該組之檔(無漏列, 無舊版殘留)
        assert.strict.deepStrictEqual(walk('bin'), ['manifest.json', ...b.files.map((v) => `mseed2ascii/${v.path}`)].sort())
    })

    it(`should have the bytes of bin/mseed2ascii/ in the pinned commit equal to the working tree (U1, F15)`, function() {
        //釘選提交內之位元組須等於工作樹bin/實檔, 否則清單之url指到不同內容(發布前即可抓出提交雜湊指錯); 淺層clone無該提交時略過
        let manifest = readManifest()
        let b = getBundle(manifest)
        //以execFileSync傳參數陣列(經cmd.exe時^為跳脫字元, 會吃掉^{commit}之^)
        try {
            execFileSync('git', ['cat-file', '-e', `${manifest.commit}^{commit}`], { stdio: 'ignore', windowsHide: true })
        }
        catch (err) {
            this.skip()
        }
        for (let f of b.files) {
            let bs = execFileSync('git', ['show', `${manifest.commit}:${b.dir}/${f.path}`], { maxBuffer: 64 * 1024 * 1024, windowsHide: true })
            assert.strict.equal(Buffer.compare(bs, fs.readFileSync(`${b.dir}/${f.path}`)), 0, f.path)
        }
    })

    it(`should derive the bundle id from the (path, sha256) of its files, so any changed file changes the id (M6)`, function() {
        let b = getBundle(readManifest())
        let id = bundleId(b.files)
        assert.strict.equal(/^[0-9a-f]{64}$/.test(id), true)
        for (let i = 0; i < b.files.length; i++) {
            let fs2 = b.files.map((v, k) => (k === i ? { ...v, sha256: v.sha256.replace(/^./, v.sha256[0] === '0' ? '1' : '0') } : v))
            assert.strict.notEqual(bundleId(fs2), id)
        }
    })

    it(`should drop the executables from the old path mseed2ascii-2.6/ but keep the source and documents of the GPL-3 program in the repo (S2)`, function() {
        for (let n of ['mseed2ascii.exe', 'cygwin1.dll', 'cygz.dll']) {
            assert.strict.equal(fs.existsSync(`mseed2ascii-2.6/${n}`), false, n)
        }
        for (let n of ['LICENSE', 'src/mseed2ascii.c', 'libmseed', 'doc', '說明.md']) {
            assert.strict.equal(fs.existsSync(`mseed2ascii-2.6/${n}`), true, n)
        }
        assert.strict.equal(/GNU GENERAL PUBLIC LICENSE\s+Version 3/.test(fs.readFileSync('mseed2ascii-2.6/LICENSE', 'utf8')), true)
    })

    //規格: 隨GitHub散布之第三方檔(cygwin1.dll、cygz.dll)其授權全文須留在repo(licenses/), 範本為w-mousekey之licenses/; mseed2ascii之GPL-3在mseed2ascii-2.6/LICENSE(上一案)
    it(`should keep the full license texts of the third-party files of the bundle in licenses/, matching the versions found inside the files`, function() {
        let b = getBundle(readManifest())
        let bin = (n) => fs.readFileSync(path.join(b.dir, n)).toString('latin1')
        let rd = (n) => fs.readFileSync(path.join('licenses', n), 'utf8')

        //版本自檔案本身讀取(非寫死): cygwin1.dll內嵌建置路徑cygwin-<版本>-<修訂>.x86_64, cygz.dll內嵌`deflate <版本> Copyright <年>`
        let vCyg = /cygwin-(\d+\.\d+\.\d+)-(\d+)\.x86_64/.exec(bin('cygwin1.dll'))
        let vZ = /deflate (\d+\.\d+\.\d+) Copyright (\d{4})-(\d{4}) Jean-loup Gailly and Mark Adler/.exec(bin('cygz.dll'))
        assert.strict.notEqual(vCyg, null)
        assert.strict.notEqual(vZ, null)

        //licenses/README.md: 每個組內檔都有一列, 且載明檔內實際版本
        let idx = rd('README.md')
        for (let f of b.files) {
            assert.strict.equal(idx.includes(`\`${f.path}\``), true, f.path)
        }
        assert.strict.equal(idx.includes(`Cygwin ${vCyg[1]}-${vCyg[2]}`), true, 'cygwin version')
        assert.strict.equal(idx.includes(`zlib ${vZ[1]}`), true, 'zlib version')

        //Cygwin(cygwin1.dll): 授權說明(LGPLv3+與連結例外)、LGPL v3全文、newlib部分之授權
        let cyg = rd('Cygwin-CYGWIN_LICENSE.txt')
        assert.strict.equal(/Lesser Gnu Public License,\s+version 3 or \(at your option\) any later version/.test(cyg), true)
        assert.strict.equal(cyg.includes('Linking Exception'), true)
        let lgpl = rd('Cygwin-LGPL-3.0.txt')
        assert.strict.equal(/GNU LESSER GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/.test(lgpl), true)
        assert.strict.equal(lgpl.includes('0. Additional Definitions.'), true)
        assert.strict.equal(lgpl.includes('6. Revised Versions of the GNU Lesser General Public License.'), true) //末條, 防截斷
        let newlib = rd('Cygwin-newlib-COPYING.NEWLIB.txt')
        assert.strict.equal(newlib.includes('The newlib subdirectory is a collection of software from several sources.'), true)
        assert.strict.equal(newlib.includes('Red Hat'), true)

        //zlib(cygz.dll): 授權全文含版權人與年份(與檔內版本之年份區間相符)與三項限制
        let z = rd('zlib-license.txt')
        assert.strict.equal(z.includes(`(C) ${vZ[2]}-${vZ[3]} Jean-loup Gailly and Mark Adler`), true)
        assert.strict.equal(z.includes(`Permission is granted to anyone to use this software for any purpose`), true)
        for (let n of ['1. The origin of this software', '2. Altered source versions', '3. This notice may not be removed']) {
            assert.strict.equal(z.includes(n), true, n)
        }

        //README指向licenses/(不再只指向Cygwin網頁)
        let readme = fs.readFileSync('README.md', 'utf8')
        assert.strict.equal(readme.includes('`licenses/`'), true)
        assert.strict.equal(readme.includes('licenses/README.md'), true)
    })

    it(`should not download at install time: no postinstall script (D1)`, function() {
        let pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
        assert.strict.equal(Object.prototype.hasOwnProperty.call(pkg.scripts || {}, 'postinstall'), false)
        assert.strict.equal(Object.prototype.hasOwnProperty.call(pkg.scripts || {}, 'install'), false)
    })

    it(`should keep the cache out of git and the npm package (S5) and bin/ and the old folder out of the npm package except the manifest (S1)`, function() {
        assert.strict.equal(lines('.gitignore').includes('/bin-cache/'), true)
        assert.strict.equal(lines('.npmignore').includes('/bin-cache/'), true)
        assert.strict.equal(lines('.npmignore').includes('/test/_tmp/'), true)
        assert.strict.equal(lines('.npmignore').includes('/bin/*'), true)
        assert.strict.equal(lines('.npmignore').includes('!/bin/manifest.json'), true)
        assert.strict.equal(lines('.npmignore').includes('/mseed2ascii-2.6/'), true)
        assert.strict.equal(lines('.gitattributes').includes('bin/** binary'), true) //F12
    })

    it(`should not pack external executables, dlls or the old folder into the npm package, only bin/manifest.json (S1, S5, T1)`, function() {
        //測試暫存、快取、舊路徑可能放有執行檔副本(他測試平行執行時即是), 先放誘餌使缺規則時確定性變紅
        let decoys = [
            `${fdt}/leak/mseed2ascii.exe`,
            `${fdt}/leak/cygwin1.dll`,
            `bin-cache/decoy/mseed2ascii.exe`,
            `bin-cache/decoy/cygz.dll`,
            `mseed2ascii-2.6/mseed2ascii.exe`,
            `mseed2ascii-2.6/cygwin1.dll`,
            `mseed2ascii-2.6/cygz.dll`,
        ]
        let hadCache = fs.existsSync('bin-cache')
        let mades = []
        let info = null
        try {
            for (let fp of decoys) {
                if (fs.existsSync(fp)) {
                    continue //既有之檔不碰(不應存在, 見上一案)
                }
                fs.mkdirSync(path.dirname(fp), { recursive: true })
                fs.writeFileSync(fp, 'MZ')
                mades.push(fp)
            }
            let r = JSON.parse(execSync('npm pack --dry-run --json', { encoding: 'utf8', windowsHide: true }))
            info = Array.isArray(r) ? r[0] : Object.values(r)[0] //npm 11以前為陣列, npm 12起為以套件名為鍵之物件
        }
        finally {
            for (let fp of mades) {
                fs.rmSync(fp, { force: true })
            }
            fs.rmSync('bin-cache/decoy', { recursive: true, force: true })
            if (!hadCache) {
                try {
                    fs.rmdirSync('bin-cache')
                }
                catch (err) {}
            }
        }
        let fps = info.files.map((v) => v.path)
        assert.strict.deepStrictEqual(fps.filter((v) => /\.(exe|dll|msi|zip|7z|\d{3})$/i.test(v)), [])
        assert.strict.deepStrictEqual(fps.filter((v) => v.startsWith('bin/') || v.startsWith('bin-cache/') || v.startsWith('mseed2ascii-2.6/') || v.startsWith('test/_tmp/')), ['bin/manifest.json'])
        //舊路徑(原隨包發布之mseed2ascii-2.6/)整個不在包內, 主檔與清單在包內
        assert.strict.equal(fps.includes('bin/manifest.json'), true)
        assert.strict.equal(fps.includes('src/WDataMseed.mjs'), true)
        assert.strict.equal(fps.includes('src/ensureBins.mjs'), true)
        //授權文(licenses/, 文字檔)入包, 作法同w-mousekey: .npmignore不排除
        let lics = fs.readdirSync('licenses')
        assert.strict.equal(lics.length >= 5, true)
        for (let n of lics) {
            assert.strict.equal(fps.includes(`licenses/${n}`), true, n)
        }
    })

})
