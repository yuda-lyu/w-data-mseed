import path from 'path'
import { fileURLToPath } from 'url'
import fsEnsureBins from 'wsemi/src/fsEnsureBins.mjs'


//pkgRoot, 本套件根目錄(以本檔位置推得, 不依賴工作目錄; 原始碼為<套件根>/src/, 打包後為<套件根>/dist/, 皆為其上一層)
let pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')


/**
 * 取得本套件之外部執行檔組mseed2ascii(mseed2ascii.exe與其相鄰之cygwin1.dll、cygz.dll): 首次使用時下載(或自鏡像取得)並以bin/manifest.json之SHA-256與大小逐檔校驗, 整組原子放入快取, 之後自快取取得(亦校驗)
 *
 * 規格: 外部執行檔之存放下載校驗與離線(制式規格)§6、M6; 實作為wsemi之fsEnsureBins, 本套件不另寫下載、快取、鏡像、校驗
 * 環境變數: W_BIN_CACHE(共用快取資料夾)、W_BIN_MIRROR(鏡像, 本地資料夾或http(s)網址)、W_BIN_OFFLINE(1為離線), 見README〈External executable〉
 *
 * @param {Object} [opt={}] 輸入設定物件, 交wsemi之fsEnsureBins(names、cacheDir、mirror、offline、onProgress等), pkgRoot固定為本套件根
 * @returns {Promise} 回傳Promise, resolve回傳{ mseed2ascii: 組資料夾絕對路徑 }, 並帶不可列舉之bundles: { mseed2ascii: { dir, id, files: { 'mseed2ascii.exe': 絕對路徑, 'cygwin1.dll': 絕對路徑, 'cygz.dll': 絕對路徑 } } }, reject回傳帶code之Error(E_OFFLINE_MISSING等)
 * @example
 * import WDataMseed from 'w-data-mseed'
 *
 * //部署前預先取得, 回傳之組資料夾內有mseed2ascii.exe、cygwin1.dll與cygz.dll
 * let bins = await WDataMseed.ensureBins()
 * console.log(bins.mseed2ascii)
 * console.log(bins.bundles.mseed2ascii.files['mseed2ascii.exe'])
 */
function ensureBins(opt = {}) {
    //floatingManifestUrl會改變清單之信任錨, 不轉傳使用者之值(主幹模式之網址由清單之repo與manifestPath決定)
    let { floatingManifestUrl, ...o } = opt || {} // eslint-disable-line no-unused-vars
    return fsEnsureBins('bin/manifest.json', { ...o, pkgRoot })
}


export default ensureBins
