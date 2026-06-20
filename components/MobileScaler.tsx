'use client'

import { useEffect } from 'react'

/**
 * 移动端（触控设备）动态缩放组件
 *
 * Android WebView 中 viewport meta width=1200 不生效，
 * 改用 JS 检测触控设备并通过 CSS transform 将桌面布局（1200px）
 * 缩放到实际屏幕宽度。
 *
 * 实现思路：
 * - 在 layout.tsx 的 <body> 内最外层包一个 <div id="__app_root__">
 * - 该 div 以 1200px 设计宽度渲染（让内部按桌面布局正常计算 vw / 百分比）
 * - 高度 = 实际 viewport 高度 / 缩放比，使 transform 缩放后正好填满 viewport
 * - 用 transform: scale(vw/1200) 整体缩放到屏幕宽度
 * - body / html 固定为 viewport 实际尺寸，overflow: hidden（内部 main 自管滚动）
 *
 * 注意：
 * - root 必须用 `height`（而非 minHeight），否则横竖屏切换时下方会出现空白
 * - 内部 layout 容器需用 h-full（相对父 root 高度），不能用 h-screen（=100vh，
 *   与缩放后的设计高度不一致，会导致 TopAppBar 之外的内容尺寸错位）
 *
 * 桌面端（鼠标设备）不做任何处理。
 */

const DESIGN_WIDTH = 1200
const APP_ROOT_ID = '__app_root__'

export function MobileScaler() {
  useEffect(() => {
    const isTouchDevice =
      'ontouchstart' in window || navigator.maxTouchPoints > 0
    if (!isTouchDevice) return

    function applyScale() {
      const root = document.getElementById(APP_ROOT_ID)
      if (!root) return

      const vw = window.innerWidth
      const vh = window.innerHeight
      // 始终按宽度比缩放（不限制 1 上限），保证横屏 vw>1200 时也铺满屏幕，避免右侧空白
      const scale = vw / DESIGN_WIDTH
      // 设计高度 = 实际可见高度 / 缩放比，使缩放后正好等于 vh，无空白
      const designHeight = Math.ceil(vh / scale)

      // 缩放容器：以 1200px 宽 + designHeight 高渲染，再整体缩放到 vw × vh
      root.style.width = DESIGN_WIDTH + 'px'
      root.style.height = designHeight + 'px'
      root.style.transformOrigin = 'top left'
      root.style.transform = `scale(${scale})`
      root.style.position = 'absolute'
      root.style.top = '0'
      root.style.left = '0'

      // body 固定为 viewport 实际尺寸，禁用滚动（内部 main 自管滚动）
      document.body.style.width = vw + 'px'
      document.body.style.height = vh + 'px'
      document.body.style.minHeight = vh + 'px'
      document.body.style.position = 'relative'
      document.body.style.overflow = 'hidden'
      document.body.style.margin = '0'

      document.documentElement.style.width = vw + 'px'
      document.documentElement.style.height = vh + 'px'
      document.documentElement.style.overflow = 'hidden'
    }

    // Android 横竖屏切换时，innerHeight 可能延迟更新，多次重算保证稳定
    const onOrientation = () => {
      applyScale()
      setTimeout(applyScale, 100)
      setTimeout(applyScale, 300)
    }
    applyScale()
    window.addEventListener('resize', applyScale)
    window.addEventListener('orientationchange', onOrientation)

    return () => {
      window.removeEventListener('resize', applyScale)
      window.removeEventListener('orientationchange', onOrientation)
    }
  }, [])

  return null
}
