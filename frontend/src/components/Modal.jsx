import React, { useState, useRef, useEffect } from 'react'
import './Modal.css'

const Modal = ({ isOpen, onClose, title, titleCenter, contentStyle, draggable, headerActions, children }) => {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [initDone, setInitDone] = useState(false)
  const dragRef = useRef({ startX: 0, startY: 0, startPosX: 0, startPosY: 0 })
  const contentRef = useRef(null)
  const overlayMouseDownTargetRef = useRef(null)

  useEffect(() => {
    if (!isOpen || !draggable) {
      setInitDone(false)
      return
    }
    const center = () => {
      const overlay = document.querySelector('.modal-overlay')
      if (!overlay || !contentRef.current) return
      const rect = overlay.getBoundingClientRect()
      const contentRect = contentRef.current.getBoundingClientRect()
      setPos({
        x: (rect.width - contentRect.width) / 2,
        y: (rect.height - contentRect.height) / 2,
      })
      setInitDone(true)
    }
    const t = requestAnimationFrame(center)
    return () => cancelAnimationFrame(t)
  }, [isOpen, draggable])

  const handleDragStart = (e) => {
    if (!draggable) return
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: pos.x, startPosY: pos.y }
  }

  useEffect(() => {
    if (!draggable || !isOpen) return
    const onMove = (e) => {
      const d = dragRef.current
      if (d.startX === undefined) return
      setPos({
        x: d.startPosX + (e.clientX - d.startX),
        y: d.startPosY + (e.clientY - d.startY),
      })
    }
    const onUp = () => {
      dragRef.current = {}
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [draggable, isOpen])

  if (!isOpen) return null

  const contentFinalStyle = {
    ...contentStyle,
    ...(draggable && initDone ? { position: 'absolute', left: pos.x, top: pos.y } : {}),
  }

  // 记录 mousedown 事件的目标，确保只有在 overlay 本身（非子元素）上按下并释放鼠标才关闭弹窗
  const handleOverlayMouseDown = (e) => {
    overlayMouseDownTargetRef.current = e.target
  }

  const handleOverlayClick = (e) => {
    // 只有当 mousedown 和 click 都发生在 overlay 本身（不是子元素）上时才关闭
    if (e.target === e.currentTarget && overlayMouseDownTargetRef.current === e.currentTarget) {
      onClose()
    }
    overlayMouseDownTargetRef.current = null
  }

  return (
    <div
      className={`modal-overlay ${draggable ? 'modal-overlay-draggable' : ''}`}
      onMouseDown={handleOverlayMouseDown}
      onClick={handleOverlayClick}
    >
      <div
        ref={contentRef}
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={contentFinalStyle}
      >
        <div
          className={`modal-header ${titleCenter ? 'modal-header-center' : ''} ${draggable ? 'modal-header-draggable' : ''}`}
          onMouseDown={handleDragStart}
        >
          <h2>{title}</h2>
          <div className="modal-header-right">
            {headerActions}
            <button className="modal-close" onClick={onClose}>
              ×
            </button>
          </div>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export default Modal
