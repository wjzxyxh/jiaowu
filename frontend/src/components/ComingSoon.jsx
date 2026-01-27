import React from 'react'
import './ComingSoon.css'

const ComingSoon = ({ title, description, icon = '🚧' }) => {
  return (
    <div className="coming-soon">
      <div className="coming-soon-content">
        <div className="coming-soon-icon">{icon}</div>
        <h1>{title}</h1>
        <p>{description || '该功能正在开发中，敬请期待...'}</p>
        <div className="coming-soon-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: '60%' }}></div>
          </div>
          <span className="progress-text">开发进度: 60%</span>
        </div>
      </div>
    </div>
  )
}

export default ComingSoon
