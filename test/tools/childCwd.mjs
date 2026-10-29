import { pathToFileURL } from 'url'


//測試用子行程腳本: 於他處工作目錄載入套件之ensureBins並離線呼叫(無快取、無鏡像), 把E_OFFLINE_MISSING之快取位置以JSON輸出到stdout
//用法: node test/tools/childCwd.mjs <src/ensureBins.mjs之絕對路徑>
//套件根須由模組位置推得而與工作目錄無關, 故快取位置應在套件根之bin-cache/下
let fp = process.argv[2]
let { default: ensureBins } = await import(pathToFileURL(fp).href)
delete process.env.W_BIN_CACHE
delete process.env.W_BIN_MIRROR
process.env.W_BIN_OFFLINE = '1'
let out = { cwd: process.cwd(), code: null, cachePath: null, message: null }
await ensureBins()
    .catch((err) => {
        out.code = err.code
        out.cachePath = err.missing && err.missing[0] ? err.missing[0].cachePath : null
        out.message = err.message
    })
process.stdout.write(JSON.stringify(out))
