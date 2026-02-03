import React, { useState, useRef, useEffect } from 'react'
import './Modal.css'

const Modal = ({ isOpen, onClose, title, titleCenter, contentStyle, draggable, headerActions, children }) => {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [initDone, setInitDone] = useState(false)
  const dragRef = useRef({ startX: 0, startY: 0, startPosX: 0, startPosY: 0 })
  const contentRef = useRef(null)

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

  return (
    <div className={`modal-overlay ${draggable ? 'modal-overlay-draggable' : ''}`} onClick={onClose}>
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
