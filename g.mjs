import fs from 'fs'
import WDataMseed from './src/WDataMseed.mjs'


async function test() {

    //fp
    let fp = './g.mseed'
    // let fp = './20200917093752_RST01_acc.mseed'

    //WDataMseed
    let r = await WDataMseed(fp)
    console.log(r)
    // [
    //   {
    //     name: 'SE.RST01.00.HNE.D.2020-09-17T013552.000000.csv',
    //     path: null,
    //     data: { heads: [Object], records: [Array] }
    //   },
    //   {
    //     name: 'SE.RST01.00.HNN.D.2020-09-17T013552.000000.csv',
    //     path: null,
    //     data: { heads: [Object], records: [Array] }
    //   },
    //   {
    //     name: 'SE.RST01.00.HNZ.D.2020-09-17T013552.000000.csv',
    //     path: null,
    //     data: { heads: [Object], records: [Array] }
    //   }
    // ]

    fs.writeFileSync('./g.json', JSON.stringify(r, null, 2), 'utf8')

}
test()
    .catch((err) => {
        console.log('catch', err)
    })


//node --experimental-modules --es-module-specifier-resolution=node g.mjs
