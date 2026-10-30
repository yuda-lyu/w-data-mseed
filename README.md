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

### External executable

The package converts through `mseed2ascii.exe` (Windows only), which must sit next to two Cygwin runtime libraries. **None of them is part of the npm package**: the package contains only the manifest `bin/manifest.json`, which records the source, SHA-256 and size of each file.

| File | Purpose | Source |
|---|---|---|
| `mseed2ascii.exe` | miniSEED to ASCII / GeoCSV converter (version 2.6) | `bin/mseed2ascii/` of the GitHub repository `yuda-lyu/w-data-mseed`, pinned to the commit recorded in `bin/manifest.json` |
| `cygwin1.dll`, `cygz.dll` | Cygwin runtime libraries that `mseed2ascii.exe` loads from its own folder | same folder |

The three files form one **bundle** (`mseed2ascii`): they are fetched, checked and placed together, and a copy of the `.exe` alone does not start (Windows error `0xC0000135`, missing dll).

- **First use**: the first call that needs the converter downloads the three files from `https://raw.githubusercontent.com/yuda-lyu/w-data-mseed/<commit>/bin/mseed2ascii/<file>`, checks each one against the SHA-256 and size in `bin/manifest.json`, and publishes the whole folder at once as `<package root>/bin-cache/<bundle id>/`. Nothing is downloaded when the package is installed. Later calls take the folder from the cache and check every file again before use (once per process, again if a file changes). If any file does not match, the whole bundle is fetched again and nothing from the bad download is left behind.
- **`WDataMseed.ensureBins()`** does the same ahead of time (for example on a build machine) and resolves to `{ mseed2ascii: '<absolute path of the folder>' }`; the files are in `bins.bundles.mseed2ascii.files` (`'mseed2ascii.exe'`, `'cygwin1.dll'`, `'cygz.dll'`). It reads the environment variables below.
- **Environment variables** (read by `ensureBins()` and by every call that converts):
  - `W_BIN_CACHE=<folder>`: keep the cache in `<folder>/w-data-mseed/<bundle id>/` instead of the package folder (use it when `node_modules` is read-only; several packages can share one folder).
  - `W_BIN_MIRROR=<folder or http(s) base URL>`: look in the mirror before GitHub. The layout is `<mirror>/w-data-mseed/<bundle id>/<file>`. A file from the mirror is checked against the manifest like any other, so a mirror cannot supply a different file; a file that does not match is refused and the next source is tried.
  - `W_BIN_OFFLINE=1`: never connect to GitHub; use only the cache and the mirror. When a file of the bundle is missing the call rejects with `code: 'E_OFFLINE_MISSING'`, and the message lists the whole bundle (every file with its SHA-256 and size) and the exact cache and mirror folders where it must be put.
- **Offline deployment** (a machine that cannot reach GitHub):
  1. On a machine with network access set `W_BIN_CACHE` to an empty folder and run a script that calls `ensureBins()` once:

     ```alias
     // prepare.mjs
     import WDataMseed from 'w-data-mseed'
     console.log(await WDataMseed.ensureBins())
     ```

     (PowerShell: `$env:W_BIN_CACHE='D:\mirror'; node prepare.mjs`.) The folder now holds `w-data-mseed/<bundle id>/` with the three files.
  2. Copy the whole folder to the offline machine and set `W_BIN_MIRROR=<that folder>` (and `W_BIN_OFFLINE=1` to forbid any network access). The first use copies the verified bundle into the local cache.
- **A failure to obtain the executable** makes `WDataMseed()` reject with a string that starts with the error code, for example `[E_OFFLINE_MISSING] fsEnsureBins[w-data-mseed]: …`; `ensureBins()` itself rejects with an `Error` that has a `code` (`E_OFFLINE_MISSING`, `E_HASH_MISMATCH`, `E_SIZE_MISMATCH`, `E_HTTP`, `E_NETWORK`, …).

#### Included tool and license

`mseed2ascii` (IRIS Data Management Center, <https://github.com/iris-edu/mseed2ascii>) is licensed under the **GNU General Public License v3**. The license text (`mseed2ascii-2.6/LICENSE`), the complete source of the version in use (`mseed2ascii-2.6/src/`, `mseed2ascii-2.6/libmseed/`), the documentation (`mseed2ascii-2.6/doc/`) and the Cygwin build steps (`mseed2ascii-2.6/說明.md`) are kept in the GitHub repository `yuda-lyu/w-data-mseed`, not in the npm package. `cygwin1.dll` (Cygwin 3.3.4-2, LGPL v3 or later with the Cygwin linking exception, plus BSD-like newlib parts) and `cygz.dll` (zlib 1.2.12, zlib license) are the Cygwin runtime libraries the executable was built against; their full license texts, the exact versions and where the texts come from are in the `licenses/` folder of the repository and of the npm package (start with `licenses/README.md`).

### Breaking changes: external executable

- `mseed2ascii.exe`, `cygwin1.dll`, `cygz.dll` and the folder `mseed2ascii-2.6/` are no longer inside the npm package. The first conversion needs network access to GitHub or a mirror (see above); machines that cannot do either must be prepared as described under *Offline deployment*.
- The executable is no longer looked up under the working directory (`./mseed2ascii-2.6/` or `./node_modules/w-data-mseed/mseed2ascii-2.6/`): it is found through the cache, so the process may run from any working directory.
- A conversion no longer changes `process.cwd()`. It used to call `process.chdir()` into the temporary output folder and back, so two conversions running at the same time could restore each other's folder (one of them failed, or the process was left in a folder that had been deleted). The output folder is now passed to the converter as the working directory of its child process.
- A failure to obtain the executable rejects `WDataMseed()` with the string described above. Before, a missing executable rejected with `can not find folder for mseed2ascii`.
- A file without miniSEED data now rejects with the message of `mseed2ascii` (for example `Error reading …: No SEED data detected`); before, the rejection value was `null`.
- The temporary output folder (`opt.fdOutPre` + time + random suffix, default prefix `_`) is now created in the operating system's temporary folder (`os.tmpdir()`, read at each call) instead of the working directory the module was loaded from, so nothing appears in the caller's working directory. On success with `readWithData: true` it is deleted as before; with `readWithData: false` it is kept and `path` of each result points into it (the caller deletes it). `fdOutPre` is still the prefix of the folder name; a relative value is resolved against `os.tmpdir()`, an absolute value is used as given.
- When a conversion fails after the output folder was created (the copy of the input fails, or the converter produces no output file), the folder is kept for inspection, as before, and the last line of the rejection string now gives its absolute path: `output folder kept for inspection: <absolute path>`. Code that matched the whole rejection string must match its beginning instead.
- The converter is now started through `execProcess` of `wsemi` (>= 1.9.33, option `cwd`) instead of a spawn helper of this package; conversions, results and the rejection strings `code[<exit code>]:\n<output>` / `spawn[<error code>]:\n<message>` are unchanged. One message differs: if the temporary output folder no longer exists when the converter is started (for example it was removed by another process), the rejection now begins with `spawn[ENOENT]:\ncwd is not an existing folder: <folder>`; before, it carried the message of Node.js, which names the executable (`spawn <path of mseed2ascii.exe> ENOENT`) and so pointed at the wrong cause.
