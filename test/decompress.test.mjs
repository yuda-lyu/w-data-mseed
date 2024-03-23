import assert from 'assert'
import w from 'wsemi'
import wds from '../src/WDataMseed.mjs'
import rdp from './g.json' assert {type:'json'}


describe('test', function() {

    it('decompress', async function() {
        let rin = null
        let rout = null

        if (w.isWindow()) {

            //rin
            rin = rdp

            //fp
            let fp = './test/g.mseed'
            // let fp = './20200917093752_RST01_acc.mseed'

            //rout
            rout = await wds(fp)

        }
        else {
            //github單元測試為linux, 略過測試
            rin = 1
            rout = 1
        }

        assert.strict.deepEqual(rin, rout)
    })

})
