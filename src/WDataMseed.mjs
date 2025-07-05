import path from 'path'
import fs from 'fs'
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
import execProcess from 'wsemi/src/execProcess.mjs'
import fsIsFile from 'wsemi/src/fsIsFile.mjs'
import fsIsFolder from 'wsemi/src/fsIsFolder.mjs'
import fsCopyFile from 'wsemi/src/fsCopyFile.mjs'
import fsCreateFolder from 'wsemi/src/fsCreateFolder.mjs'
import fsTreeFolder from 'wsemi/src/fsTreeFolder.mjs'
import fsDeleteFolder from 'wsemi/src/fsDeleteFolder.mjs'


let fdSrv = path.resolve()


function isWindows() {
    return process.platform === 'win32'
}


/**
 * 讀取miniSEED檔案，只能用於Windows作業系統
 *
 * @param {String} fp 輸入檔案路徑字串
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {String} [opt.ver='4.8'] 輸入調用windows程序之Net Framework版本字串，可有'4.5'、'4.6'、'4.7.2'與'4.8'，預設'4.8'
 * @returns {Promise} 回傳Promise，resolve回傳成功訊息，reject回傳錯誤訊息
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

    //fdExe
    let fdExe = ''
    if (true) {
        let fdExeSrc = `${fdSrv}/mseed2ascii-2.6/`
        let fdExeNM = `${fdSrv}/node_modules/w-data-mseed/mseed2ascii-2.6/`
        if (fsIsFile(`${fdExeSrc}${fnExe}`)) {
            fdExe = fdExeSrc
        }
        else if (fsIsFile(`${fdExeNM}${fnExe}`)) {
            fdExe = fdExeNM
        }
        else {
            return Promise.reject('can not find folder for mseed2ascii')
        }
    }
    // console.log('fdExe', fdExe)

    //prog
    let prog = path.resolve(fdExe, fnExe)
    // prog = `"${prog}"` //用雙引號包住避免路徑有空格 //execProcess預設spawn不需要用雙引號括住prog
    // console.log('prog', prog)

    //fdOut
    let fdOut = path.resolve(fdSrv, `${fdOutPre}${now2strp()}-${genID(6)}`)
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
            return Promise.reject('fsCopyFile error')
        }
    }

    //check
    if (!fsIsFile(fpIn)) {
        console.log('fpIn is not file', fpIn)
        return Promise.reject('fpIn is not file')
    }

    //cmd, -G為輸出GeoCSV格式
    // let cmd = ['-G', `"${fpIn}"`] //`-G "${fpIn}"`
    let cmd = ['-G', fpIn] //execProcess預設spawn不需要用雙引號括住fpIn
    // console.log('cmd', cmd)

    //cwdOri, cwdTar
    let cwdOri = process.cwd()
    let cwdTar = fdOut
    // console.log('process.cwd1', process.cwd())

    //chdir, 若不切換mseed2ascii預設輸出檔案是在工作路徑, 輸出檔變成會出現在專案下
    process.chdir(cwdTar)
    // console.log('process.cwd2', process.cwd())

    //execProcess
    let cbStdout = (msg) => {
        // console.log('cbStdout', msg)
    }
    let cbStderr = (msg) => {
        // console.log('cbStderr', msg)
    }
    await execProcess(prog, cmd, { cbStdout, cbStderr })
        .then(function(res) {
            // console.log('execProcess then', res)
            //執行成功未有stdout訊息
        })
        .catch((err) => {
            console.log('execProcess catch', err)
            errTemp = err.toString()
            //mseed2ascii執行成功會通過stderr輸出, 導致execProcess用catch提供成功訊息, 故用catch儲存err仍無法判識是否執行失敗
        })

    //chdir, 不論正常或錯誤皆需還原工作路徑
    process.chdir(cwdOri)

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
        return Promise.reject(errTemp) //因無輸出檔, errTemp可假設為錯誤訊息使用reject會傳並跳出, 且不刪除fdOut資料夾與其內輸入或可能之輸出檔, 供查找偵測之用
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


export default WDataMseed
