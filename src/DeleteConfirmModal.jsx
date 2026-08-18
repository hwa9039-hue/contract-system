import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export const DELETE_CONFIRM_MESSAGE =
  '정말 삭제하시겠습니까? 삭제된 데이터는 복구할 수 없습니다.'

/**
 * 공통 삭제 확인 모달.
 * 리스트의 삭제는 이 모달의 [삭제]를 눌렀을 때만 실행한다.
 */
export function DeleteConfirmModal({
  open,
  onCancel,
  onConfirm,
  confirmBusy = false,
}) {
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !confirmBusy) onCancel?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel, confirmBusy])

  if (!open || typeof document === 'undefined' || !document.body) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={() => {
        if (!confirmBusy) onCancel?.()
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
        aria-describedby="delete-confirm-message"
        className="w-full max-w-[420px] rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="delete-confirm-title" className="m-0 text-lg font-extrabold tracking-tight text-slate-800">
          삭제 확인
        </h3>
        <p id="delete-confirm-message" className="mt-3 mb-0 text-[15px] leading-relaxed text-slate-600">
          {DELETE_CONFIRM_MESSAGE}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg bg-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-300 disabled:opacity-60"
            onClick={onCancel}
            disabled={confirmBusy}
          >
            취소
          </button>
          <button
            type="button"
            className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
            onClick={onConfirm}
            disabled={confirmBusy}
          >
            {confirmBusy ? '삭제 중...' : '삭제'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

/** 리스트 삭제를 모달에 맡길 때: itemToDelete 에 ID만 넣고, 확인 시에만 실행 */
export function useDeleteConfirm() {
  const [itemToDelete, setItemToDelete] = useState(null)
  const isModalOpen = itemToDelete != null

  const requestDelete = useCallback((id) => {
    setItemToDelete(id)
  }, [])

  const cancelDelete = useCallback(() => {
    setItemToDelete(null)
  }, [])

  return {
    itemToDelete,
    isModalOpen,
    requestDelete,
    cancelDelete,
    setItemToDelete,
  }
}
