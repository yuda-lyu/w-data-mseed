import assert from 'assert'
import wds from '../src/WDataMseed.mjs'
import rin from './g.json' assert {type:'json'}


describe('test', function() {

    it('decompress', async function() {

        //fp
        let fp = './test/g.mseed'
        // let fp = './20200917093752_RST01_acc.mseed'

        //WDataMseed
        let rout = await wds(fp)

        assert.strict.deepEqual(rin, rout)
    })

})
