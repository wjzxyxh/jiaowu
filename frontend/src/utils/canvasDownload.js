/**
 * 将 canvas 导出为 PNG 并触发浏览器下载（保存到本地下载目录）。
 * 使用 Blob + 挂 DOM 的 <a> 点击，比纯 data URL 在 Safari/部分 WebView 上更可靠。
 */
export function downloadCanvasPng(canvas, rawFileName = 'screenshot.png', options = {}) {
  const { copyToClipboard = true } = options
  const fileName = String(rawFileName || 'screenshot.png').replace(/[/\\?%*:|"<>]/g, '_')

  return new Promise((resolve, reject) => {
    const triggerDownload = (href) => {
      const link = document.createElement('a')
      link.href = href
      link.download = fileName
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }

    const maybeClipboard = (blob) => {
      if (!copyToClipboard || !blob || !navigator.clipboard?.write) return
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch((e) => {
        console.warn('剪贴板写入失败:', e)
      })
    }

    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob(
        (blob) => {
          try {
            if (blob) {
              const url = URL.createObjectURL(blob)
              triggerDownload(url)
              setTimeout(() => URL.revokeObjectURL(url), 2000)
              maybeClipboard(blob)
            } else {
              triggerDownload(canvas.toDataURL('image/png'))
            }
            resolve()
          } catch (e) {
            reject(e)
          }
        },
        'image/png',
        1,
      )
    } else {
      try {
        triggerDownload(canvas.toDataURL('image/png'))
        resolve()
      } catch (e) {
        reject(e)
      }
    }
  })
}
