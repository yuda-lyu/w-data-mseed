import rollupFiles from 'w-package-tools/src/rollupFiles.mjs'
import getFiles from 'w-package-tools/src/getFiles.mjs'


let fdSrc = './src'
let fdTar = './dist'


rollupFiles({
    fns: 'WDataMseed.mjs',
    fdSrc,
    fdTar,
    nameDistType: 'kebabCase',
    globals: {
        'path': 'path',
        'fs': 'fs',
        'process': 'process',
        'child_process': 'child_process',
        'url': 'url', //ensureBins.mjs(以fileURLToPath推得套件根)與wsemi之fsEnsureBins使用
        'crypto': 'crypto', //wsemi之fsEnsureBins使用
        'stream': 'stream', //wsemi之fsEnsureBins使用
        'stream/promises': 'stream/promises', //wsemi之fsEnsureBins使用
        'os': 'os', //wsemi之fsEnsureBins使用(暫存夾)
    },
    external: [
        'path',
        'fs',
        'process',
        'child_process',
        'url',
        'crypto',
        'stream',
        'stream/promises',
        'os',
    ],
})
