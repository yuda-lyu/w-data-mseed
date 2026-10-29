# Third-party licenses

The GitHub repository distributes three prebuilt files in `bin/mseed2ascii/` (they are **not** part of the npm package; `bin/manifest.json` pins them). This folder holds the license texts of the components inside them. The files are copies of the upstream texts, unchanged.

| File in `bin/mseed2ascii/` | Component and version (read from the file) | License | Texts here |
|---|---|---|---|
| `mseed2ascii.exe` | mseed2ascii 2.6 (IRIS Data Management Center) | GNU GPL v3 | `mseed2ascii-2.6/LICENSE` (with the complete source in `mseed2ascii-2.6/`) |
| `cygwin1.dll` | Cygwin 3.3.4-2 (x86_64) | GNU LGPL v3 or later with the Cygwin linking exception; parts under BSD-like licenses (newlib) | `Cygwin-CYGWIN_LICENSE.txt`, `Cygwin-LGPL-3.0.txt`, `Cygwin-newlib-COPYING.NEWLIB.txt` |
| `cygz.dll` | zlib 1.2.12 (built by the Cygwin project; the file reports `deflate 1.2.12 Copyright 1995-2022 Jean-loup Gailly and Mark Adler`) | zlib license | `zlib-license.txt` |

## Where the texts come from

| File | Upstream file |
|---|---|
| `Cygwin-CYGWIN_LICENSE.txt` | `winsup/CYGWIN_LICENSE` of the Cygwin source, tag `cygwin-3_3_4-release` |
| `Cygwin-LGPL-3.0.txt` | `winsup/COPYING.LIB` of the same tag (the LGPL v3 text that `CYGWIN_LICENSE` refers to as `COPYING.LIB`) |
| `Cygwin-newlib-COPYING.NEWLIB.txt` | `COPYING.NEWLIB` of the same tag (licenses of the newlib parts built into `cygwin1.dll`) |
| `zlib-license.txt` | section "Copyright notice" of `README` of zlib `v1.2.12` (same wording as the header of `zlib.h` of that version) |

- Cygwin source: <https://sourceware.org/git/?p=newlib-cygwin.git;a=tree;hb=refs/tags/cygwin-3_3_4-release> (project page and licensing overview: <https://cygwin.com/licensing.html>).
- zlib source: <https://github.com/madler/zlib/tree/v1.2.12> (<https://zlib.net/zlib_license.html>).
- `winsup/COPYING` (GPL v3) of Cygwin covers the Cygwin utilities that are not linked into `cygwin1.dll`; it does not apply to these files and is not included.
