# w-data-mseed
A tool for miniSEED(mseed) data.

![language](https://img.shields.io/badge/language-JavaScript-orange.svg) 
[![npm version](http://img.shields.io/npm/v/w-data-mseed.svg?style=flat)](https://npmjs.org/package/w-data-mseed) 
[![license](https://img.shields.io/npm/l/w-data-mseed.svg?style=flat)](https://npmjs.org/package/w-data-mseed) 
[![npm download](https://img.shields.io/npm/dt/w-data-mseed.svg)](https://npmjs.org/package/w-data-mseed) 
[![npm download](https://img.shields.io/npm/dm/w-data-mseed.svg)](https://npmjs.org/package/w-data-mseed) 
[![jsdelivr download](https://img.shields.io/jsdelivr/npm/hm/w-data-mseed.svg)](https://www.jsdelivr.com/package/npm/w-data-mseed)

## Documentation
To view documentation or get support, visit [docs](https://yuda-lyu.github.io/w-data-mseed/global.html).

## Core
> `w-data-mseed` is basing on `mseed2ascii` of IRIS.

## Installation
### Using npm(ES6 module):
```alias
npm i w-data-mseed
```

#### Example:
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-data-mseed/blob/master/g.mjs)]
```alias
import WDataMseed from './src/WDataMseed.mjs'

async function test() {

    //fp
    let fp = './g.mseed'

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

}
test()
    .catch((err) => {
        console.log('catch', err)
    })

```
