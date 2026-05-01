#!/usr/bin/env node
/**
 * bundle-sidecar.js
 * 
 * 将 Next.js standalone 产物打包到 src-tauri/server/ 目录，
 * 供 Tauri 生产模式作为 sidecar 运行。
 */

const fs = require('fs')
const path = require('path')
const { ROOT, buildAndLocateStandalone, assembleServerBundle, printBundleSize } = require('./standalone-utils')

const SERVER_DIR = path.join(ROOT, 'src-tauri', 'server')
const FRONTEND_DIR = path.join(ROOT, 'src-tauri', 'frontend')

const standaloneRoot = buildAndLocateStandalone()
assembleServerBundle(standaloneRoot, SERVER_DIR)

// 创建 frontendDist 占位目录（Tauri 构建需要，实际前端由 Next.js server 提供）
fs.mkdirSync(FRONTEND_DIR, { recursive: true })
fs.writeFileSync(path.join(FRONTEND_DIR, 'index.html'), [
  '<!DOCTYPE html>',
  '<html><head><meta charset="utf-8"></head>',
  '<body>Loading...</body></html>',
].join('\n'))
console.log('[bundle-sidecar] Created frontend placeholder:', FRONTEND_DIR)

console.log('[bundle-sidecar] Done! Server bundle at:', SERVER_DIR)
printBundleSize(SERVER_DIR)
