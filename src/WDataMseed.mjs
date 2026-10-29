import path from 'path'
import fs from 'fs'
import os from 'os'
import cp from 'child_process'
import process from 'process'
import get from 'lodash-es/get.js'
import map from 'lodash-es/map.js'
import filter from 'lodash-es/filter.js'
import size from 'lodash-es/size.js'
import drop from 'lodash-es/drop.js'
import genID from 'wsemi/src/genID.mjs'
import now2strp from 'wsemi/src/now2strp.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import isbol from 'wsemi/src/isbol.mjs'
import cdbl from 'wsemi/src/cdbl.mjs'
import sep from 'wsemi/src/sep.mjs'
import fsIsFile from 'wsemi/src/fsIsFile.mjs'
import fsIsFolder from 'wsemi/src/fsIsFolder.mjs'
import fsCopyFile from 'wsemi/src/fsCopyFile.mjs'
import fsCreateFolder from 'wsemi/src/fsCreateFolder.mjs'
import fsTreeFolder from 'wsemi/src/fsTreeFolder.mjs'
import fsDeleteFolder from 'wsemi/src/fsDeleteFolder.mjs'
import ensureBins from './ensureBins.mjs'


function isWindows() {
    return process.platform === 'win32'
}


//rejectKeep, 輸出夾已建立後之reject: 該夾會保留供查找, 故於訊息附上其絕對路徑(夾在os.tmpdir()下, 呼叫端不知其位置)
function rejectKeep(msg, fdOut) {
    return Promise.reject(`${msg}\noutput folder kept for inspection: ${fdOut}`)
}


//runExe, 以子行程之cwd選項指定工作路徑執行prog, 不改本行程之process.cwd(), 故多個轉換併發時不會互相干擾
//mseed2ascii預設把輸出檔寫在工作路徑且無指定輸出資料夾之參數, 故以cwd指向各次轉換專用之輸出夾
//不論成功與否皆resolve { err, text }: err於離開碼為0時為null, 否則為`code[離開碼]:\n輸出`或`spawn[錯誤碼]:\n訊息`(同execProcess); text為stdout與stderr合併之輸出(mseed2ascii之訊息輸出於stderr)
function runExe(prog, args, cwd) {
    return new Promise((resolve) => {
        let chunks = []
        let settled = false
        let settle = (fnErr) => {
            if (settled) {
                return
            }
            settled = true
            let text = Buffer.concat(chunks).toString('utf8')
            resolve({ err: fnErr(text), text })
        }
        let sp = null
        try {
            sp = cp.spawn(prog, args, { cwd, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
        }
        catch (err) {
            settle(() => `spawn[${get(err, 'code')}]:\n${get(err, 'message')}`)
            return
        }
        //error須先於存取stdout與stderr監聽: 建立失敗(找不到執行檔、系統資源用盡等)時以error事件回報
        sp.on('error', (err) => {
            settle(() => `spawn[${get(err, 'code')}]:\n${get(err, 'message')}`)
        })
        let onData = (c) => {
            chunks.push(c)
        }
        if (sp.stdout) {
            sp.stdout.on('data', onData)
        }
        if (sp.stderr) {
            sp.stderr.on('data', onData)
        }
        sp.on('close', (code) => {
            settle((text) => (code === 0 ? null : `code[${code}]:\n${text}`))
        })
    })
}


/**
 * 讀取miniSEED檔案，只能用於Windows作業系統
 *
 * 轉檔由mseed2ascii.exe(與相鄰之cygwin1.dll、cygz.dll)完成，這些外部執行檔不含於npm包，首次轉檔時經ensureBins自GitHub(釘選提交)或環境變數W_BIN_MIRROR之鏡像取得，以bin/manifest.json之SHA-256與大小逐檔校驗後存於快取(預設為套件根之bin-cache/，可由W_BIN_CACHE改位置)，之後自快取取得(亦校驗)；環境變數W_BIN_OFFLINE=1時不連網。取得失敗則reject字串，內含錯誤代碼(如E_OFFLINE_MISSING、E_HASH_MISMATCH)與原因，詳見README〈External executable〉
 *
 * 轉檔之暫存輸出夾建於作業系統暫存夾os.tmpdir()下(夾名為`${fdOutPre}<時間>-<亂數>`)，呼叫端之工作路徑內不會出現任何檔。轉檔成功且readWithData=true時刪除該夾；失敗時保留該夾供查找，reject之訊息末行附其絕對路徑(`output folder kept for inspection: <路徑>`)
 *
 * @param {String} fp 輸入檔案路徑字串
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {String} [opt.ver='4.8'] 輸入調用windows程序之Net Framework版本字串，可有'4.5'、'4.6'、'4.7.2'與'4.8'，預設'4.8'
 * @param {String} [opt.fdOutPre='_'] 輸入暫存輸出夾之夾名前綴字串，預設'_'；為相對名稱時夾建於os.tmpdir()下，給絕對路徑則於該處建立
 * @param {Boolean} [opt.readWithData=true] 輸入是否讀取輸出檔數據布林值，預設true；為false時保留輸出夾，回傳之各項path為輸出檔位置，由呼叫端自行刪除
 * @returns {Promise} 回傳Promise，resolve回傳成功訊息，reject回傳錯誤訊息字串(輸出夾已建立後之錯誤，訊息末行附保留之輸出夾絕對路徑)
 * @example
 * import wds from './src/WDataMseed.mjs'
 *
 * async function test() {
 *
 *     //fp
 *     let fp = './g.mseed'
 *
 *     //wds
 *     let r = await wds(fp)
 *     console.log(r)
 *     // [
 *     //   {
 *     //     name: 'SE.RST01.00.HNE.D.2020-09-17T013552.000000.csv',
 *     //     path: null,
 *     //     data: { heads: [Object], records: [Array] }
 *     //   },
 *     //   {
 *     //     name: 'SE.RST01.00.HNN.D.2020-09-17T013552.000000.csv',
 *     //     path: null,
 *     //     data: { heads: [Object], records: [Array] }
 *     //   },
 *     //   {
 *     //     name: 'SE.RST01.00.HNZ.D.2020-09-17T013552.000000.csv',
 *     //     path: null,
 *     //     data: { heads: [Object], records: [Array] }
 *     //   }
 *     // ]
 *
 * }
 * test()
 *     .catch((err) => {
 *         console.log('catch', err)
 *     })
 *
 */
async function WDataMseed(fp, opt = {}) {
    let errTemp = null

    //isWindows
    if (!isWindows()) {
        return Promise.reject('operating system is not windows')
    }

    //fdOutPre
    let fdOutPre = get(opt, 'fdOutPre')
    if (!isestr(fdOutPre)) {
        fdOutPre = '_'
    }

    //readWithData
    let readWithData = get(opt, 'readWithData')
    if (!isbol(readWithData)) {
        readWithData = true
    }

    //check
    if (!fsIsFile(fp)) {
        return Promise.reject('fp is not a file')
    }

    //fnExe
    let fnExe = `mseed2ascii.exe`

    //prog, 經ensureBins取得檔案組mseed2ascii(exe與相鄰之兩個dll; 快取命中亦校驗, 未命中則自鏡像或GitHub取得並校驗), 本函數以字串reject, 故將帶code之Error轉為字串
    let prog = ''
    let errBin = null
    await ensureBins()
        .then((r) => {
            prog = get(r, ['bundles', 'mseed2ascii', 'files', fnExe], '')
        })
        .catch((err) => {
            errBin = `${isestr(get(err, 'code')) ? `[${err.code}] ` : ''}${isestr(get(err, 'message')) ? err.message : String(err)}`
        })
    if (errBin) {
        return Promise.reject(errBin)
    }
    if (!isestr(prog)) {
        return Promise.reject(`can not find ${fnExe} in the bundle mseed2ascii`)
    }
    // console.log('prog', prog)

    //fdOut, 建於作業系統暫存夾os.tmpdir()下(呼叫端之工作路徑不出現任何檔), 呼叫當下取值; fdOutPre為資料夾名前綴, 給絕對路徑時則於該處建立
    let fdOut = path.resolve(os.tmpdir(), `${fdOutPre}${now2strp()}-${genID(6)}`)
    // console.log('fdOut', fdOut)

    //fsCreateFolder
    if (!fsIsFolder(fdOut)) {
        fsCreateFolder(fdOut)
    }

    //fnIn
    let fnIn = 'temp.mseed'

    //fpIn
    let fpIn = path.resolve(fdOut, fnIn)
    // console.log('fpIn', fpIn)

    //fsCopyFile
    if (true) {
        let r = fsCopyFile(fp, fpIn)
        if (r.error) {
            console.log('fsCopyFile', r.error)
            return rejectKeep('fsCopyFile error', fdOut)
        }
    }

    //check
    if (!fsIsFile(fpIn)) {
        console.log('fpIn is not file', fpIn)
        return rejectKeep('fpIn is not file', fdOut)
    }

    //cmd, -G為輸出GeoCSV格式
    // let cmd = ['-G', `"${fpIn}"`] //`-G "${fpIn}"`
    let cmd = ['-G', fpIn] //spawn不經shell, 不需要用雙引號括住fpIn
    // console.log('cmd', cmd)

    //runExe, 以子行程之cwd指向輸出夾(mseed2ascii預設輸出檔案是在工作路徑, 不指定則輸出檔會出現在專案下), 不改本行程之工作路徑
    let { err: errExe, text: msgExe } = await runExe(prog, cmd, fdOut)
    if (errExe) {
        console.log('runExe error', errExe)
        errTemp = errExe
    }

    //fsTreeFolder
    let rs = []
    try {
        rs = fsTreeFolder(fdOut)
        // console.log('rs(tree)', rs)
        rs = filter(rs, (v) => {
            return v.name !== fnIn
        })
    }
    catch (err) {}
    // console.log('rs(filter)', rs)

    //check
    if (size(rs) === 0) {
        return rejectKeep(errTemp || msgExe, fdOut) //因無輸出檔, errTemp(或離開碼為0但無輸出檔時mseed2ascii之輸出訊息)可假設為錯誤訊息使用reject會傳並跳出, 且不刪除fdOut資料夾與其內輸入或可能之輸出檔, 供查找偵測之用, 訊息附fdOut之絕對路徑
    }

    //map
    rs = map(rs, (v) => {
        return {
            name: v.name,
            path: v.path,
            data: null,
        }
    })
    // console.log('rs(map)', rs)

    // function readHeads(fp) {
    //     let bs = fs.readFileSync(fp)
    //     let record = new MSR(bs) //use libmseedjs: https://github.com/Jollyfant/libmseedjs
    //     console.log('record', record)
    //     return record
    // }

    // //heads
    // let heads = readHeads(fpIn)
    // console.log('heads.header', heads.header)
    // mSEEDHeader {
    //   sequenceNumber: '142537',
    //   dataQuality: 'D',
    //   encoding: 11,
    //   byteOrder: 1,
    //   timingQuality: 100,
    //   microSeconds: 0,
    //   recordLength: 512,
    //   sampleRate: 200,
    //   nFrames: 7,
    //   nBlockettes: 2,
    //   nSamples: 390,
    //   flags: { activity: 0, clock: 0, quality: 0 },
    //   timingCorrection: 0,
    //   start: 1609430401775,
    //   end: 1609430403725,
    //   station: 'RST01',
    //   location: '00',
    //   channel: 'HNE',
    //   network: 'SE'
    // }

    function readData(fp) {

        //readFileSync
        let c = fs.readFileSync(fp, 'utf8')

        //lines
        let lines = sep(c, '\n')
        // console.log('lines', lines)

        //GeoCSV
        //0 # dataset: GeoCSV 2.0
        //1 # delimiter: ,
        //2 # SID: SE_RST01_00_HNE
        //3 # sample_count: 84001
        //4 # sample_rate_hz: 200
        //5 # start_time: 2020-09-17T01:35:52.000000Z
        //6 # field_unit: Counts
        //7 # field_type: FLOAT
        //8 Sample

        let t

        //dataset
        t = get(lines, 0, '')
        t = t.replace('# dataset: ', '')
        let dataset = t

        //SID
        t = get(lines, 2, '')
        t = t.replace('# SID: ', '')
        let SID = t

        //sample_count
        t = get(lines, 3, '')
        t = t.replace('# sample_count: ', '')
        let sample_count = t

        //sample_rate_hz
        t = get(lines, 4, '')
        t = t.replace('# sample_rate_hz: ', '')
        let sample_rate_hz = t

        //start_time
        t = get(lines, 5, '')
        t = t.replace('# start_time: ', '')
        let start_time = t

        //field_unit
        t = get(lines, 6, '')
        t = t.replace('# field_unit: ', '')
        let field_unit = t

        //field_type
        t = get(lines, 7, '')
        t = t.replace('# field_type: ', '')
        let field_type = t

        // //heads
        // let heads = head(lines, 1)
        // // console.log('heads', heads)
        // heads = sep(heads, ',')
        // // console.log('heads', heads)
        // // [
        // //   'TIMESERIES SE_RST01_00_HNE_D',
        // //   '17279707 samples',
        // //   '200 sps',
        // //   '2021-01-01T00:00:01.775000',
        // //   'SLIST',
        // //   'INTEGER',
        // //   'Counts'
        // // ]

        // //kpHeads
        // let kpHeads = {}
        // each(heads, (v, k) => {
        //     if (v.indexOf('TIMESERIES') >= 0) {
        //         let t = v.replace('TIMESERIES', '')
        //         t = trim(t)
        //         kpHeads['name'] = t
        //     }
        //     if (v.indexOf('samples') >= 0) {
        //         let t = v.replace('samples', '')
        //         t = cdbl(t)
        //         kpHeads['samples'] = t
        //     }
        //     if (v.indexOf('sps') >= 0) {
        //         let t = v.replace('sps', '')
        //         t = trim(t)
        //         if (isnum(t)) {
        //             t = cdbl(t)
        //         }
        //         kpHeads['sps'] = t
        //     }
        //     if (k === 3) {
        //         let t = v
        //         t = trim(t)
        //         kpHeads['time'] = t
        //     }
        // })
        let kpHeads = {
            dataset,
            SID,
            sample_count,
            sample_rate_hz,
            start_time,
            field_unit,
            field_type,
        }
        // console.log('kpHeads', kpHeads)

        //ds
        // let ds = drop(lines)
        let ds = drop(lines, 9)
        ds = map(ds, cdbl)
        // console.log('ds[0]', ds[0], 'ds[1]', ds[1])

        return {
            heads: kpHeads,
            records: ds
        }
    }

    //unlinkSync
    try {
        fs.unlinkSync(fpIn)
    }
    catch (err) {}

    //readWithData
    if (readWithData) {

        //readData
        rs = map(rs, (v) => {
            return {
                name: v.name,
                path: null, //若讀取檔案則不提供暫存檔案位置
                data: readData(v.path), //若讀取檔案則回傳解析數據
            }
        })

        //fsDeleteFolder, 若readWithData=true則可刪除暫存資料夾
        fsDeleteFolder(fdOut)

    }

    return rs
}


//ensureBins, 以靜態屬性提供(不另加具名匯出, 使UMD打包後default匯出形態不變): 供部署前預先取得mseed2ascii.exe與其dll, 見README〈External executable〉
WDataMseed.ensureBins = ensureBins


export default WDataMseed
