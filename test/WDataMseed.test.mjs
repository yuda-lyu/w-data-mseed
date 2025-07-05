import fs from 'fs'
import assert from 'assert'
import wds from '../src/WDataMseed.mjs'


function isWindows() {
    return process.platform === 'win32'
}


describe('WDataMseed', function() {

    //check
    if (!isWindows()) {
        return
    }

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
