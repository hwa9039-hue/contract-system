import { useEffect, useRef, useState } from 'react'

/**
 * 모달 입력. 치는 동안 부모 화면을 다시 그리지 않고, 값은 onValue로 즉시 반영한다.
 * onValue는 state가 아니라 ref만 갱신해야 한다.
 */
export function QuietField({ value, onValue, multiline = false, ...rest }) {
  const [text, setText] = useState(value ?? '')
  const focusedRef = useRef(false)

  useEffect(() => {
    if (focusedRef.current) return
    setText(value ?? '')
  }, [value])

  const handleChange = (event) => {
    const next = event.target.value
    setText(next)
    onValue?.(next)
  }

  const shared = {
    ...rest,
    value: text,
    onFocus: (event) => {
      focusedRef.current = true
      rest.onFocus?.(event)
    },
    onBlur: (event) => {
      focusedRef.current = false
      rest.onBlur?.(event)
    },
    onChange: handleChange,
  }

  if (multiline) return <textarea {...shared} />
  return <input {...shared} />
}
