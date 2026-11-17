import { useEffect, useRef } from 'react'

/**
 * 모달이 열려 있는 동안 ESC 키로 onClose 를 호출한다.
 * 드롭다운 등 안쪽에서 ESC 를 이미 처리했거나(preventDefault),
 * 이 모달 위에 다른 aria-modal 창(삭제 확인 등)이 떠 있으면 닫지 않는다.
 */
export function useModalEscapeClose(dialogRef, onClose, enabled = true) {
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!enabled) return undefined
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const dialog = dialogRef?.current
      if (dialog) {
        const modals = document.querySelectorAll('[aria-modal="true"]')
        if (modals.length && modals[modals.length - 1] !== dialog) return
      }
      onCloseRef.current?.()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [dialogRef, enabled])
}
