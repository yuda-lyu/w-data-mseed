import fs from 'fs'
import assert from 'assert'
import wds from '../src/WDataMseed.mjs'
import { setBinEnv } from './tools/binEnv.mjs'


function isWindows() {
    return process.platform === 'win32'
}


describe('WDataMseed', function() {

    //check
    if (!isWindows()) {
        return
    }

    //以repo bin/之實檔建本機鏡像並離線取得mseed2ascii.exe(不連外網, 規格§8), 快取與鏡像在test/_tmp/WDataMseed-golden/
    let env = null

    before(function() {
        env = setBinEnv('WDataMseed-golden')
    })

    after(function() {
        env.restore()
    })

    it('decompress', async function() {

        //fpIn
        let fpIn = './test/g.mseed'
        // let fp = './20200917093752_RST01_acc.mseed'

        //r
        let j = fs.readFileSync('./test/g.json', 'utf8')
        let r = JSON.parse(j)

        //rr
        let rr = await wds(fpIn)

        assert.strict.deepEqual(r, rr)
    })

})
