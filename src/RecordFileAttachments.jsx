import { useRef, useState } from 'react'
import { Paperclip } from 'lucide-react'
import { addLocalAttachmentFiles, formatAttachmentSize } from './recordFileAttachments.js'

export function RecordAttachmentChip({
  count = 0,
  onClick,
  disabled = false,
  title,
  className = '',
}) {
  const n = Number(count) || 0
  const label = title || (n > 0 ? `파일 첨부 ${n}개` : '파일 첨부')
  return (
    <button
      type="button"
      className={`record-attach-chip${n > 0 ? ' has-files' : ''}${className ? ` ${className}` : ''}`}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Paperclip size={16} strokeWidth={2.2} aria-hidden />
      {n > 0 ? <span className="record-attach-chip-count">{n > 99 ? '99+' : n}</span> : null}
    </button>
  )
}

export function RecordFileAttachments({
  items = [],
  onChange,
  disabled = false,
  downloadHrefFor,
}) {
  const inputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)

  const addFiles = (fileList) => {
    if (disabled) return
    const next = addLocalAttachmentFiles(items, fileList)
    onChange?.(next)
  }

  const removeItem = (itemId) => {
    if (disabled) return
    onChange?.((Array.isArray(items) ? items : []).filter((item) => item.id !== itemId))
  }

  return (
    <div className="record-file-attachments" data-pdf-exclude="true">
      <p className="record-file-attachments-title">파일 첨부</p>
      <div
        className={`record-file-dropzone${dragOver ? ' is-dragover' : ''}${disabled ? ' is-disabled' : ''}`}
        onDragEnter={(e) => {
          e.preventDefault()
          if (!disabled) setDragOver(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          addFiles(e.dataTransfer?.files)
        }}
      >
        <p className="record-file-dropzone-copy">파일을 끌어다 놓거나 선택하세요. 개수·용량 제한 없음.</p>
        <button
          type="button"
          className="secondary-btn record-file-pick-btn"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          파일 선택
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="record-file-input"
          disabled={disabled}
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {items.length > 0 ? (
        <ul className="record-file-list">
          {items.map((item) => {
            const href = item.persisted && typeof downloadHrefFor === 'function' ? downloadHrefFor(item) : ''
            return (
              <li key={item.id} className="record-file-item">
                <div className="record-file-meta">
                  {href ? (
                    <a className="record-file-name" href={href} target="_blank" rel="noreferrer">
                      {item.name}
                    </a>
                  ) : (
                    <span className="record-file-name">{item.name}</span>
                  )}
                  <span className="record-file-size">{formatAttachmentSize(item.size)}</span>
                </div>
                <button
                  type="button"
                  className="record-file-remove"
                  aria-label={`${item.name} 삭제`}
                  disabled={disabled}
                  onClick={() => removeItem(item.id)}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="record-file-empty">첨부된 파일이 없습니다.</p>
      )}
    </div>
  )
}
