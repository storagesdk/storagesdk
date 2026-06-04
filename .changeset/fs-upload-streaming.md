---
'@storagesdk/adapters': patch
---

fs: stream uploads to a temp file and atomically rename into place instead of buffering the whole body in memory, so large files and `ReadableStream` bodies no longer risk OOMing the process
