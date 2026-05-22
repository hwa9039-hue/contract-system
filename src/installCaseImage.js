/** 설치사례 이미지 업로드 전 리사이즈·압축 (대용량 base64 POST 방지) */
export async function compressInstallCaseImage(file, { maxEdge = 1600, quality = 0.82 } = {}) {
  if (!(file instanceof File) || !file.type.startsWith('image/')) {
    return file
  }

  if (file.size <= 400 * 1024 && !file.type.includes('png')) {
    return file
  }

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close?.()
    return file
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result)
        else reject(new Error('이미지 압축에 실패했습니다.'))
      },
      'image/jpeg',
      quality
    )
  })

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'install-case'
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
}
