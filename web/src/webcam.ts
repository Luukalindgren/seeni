// "Ota kuva" on a computer: a file input cannot open a webcam there, so this shows the camera
// in a dialog and takes a still from it. The photo stays in memory only, and the camera is
// switched off as soon as the dialog closes or the page is hidden (hard rule 9).

export async function hasCamera(): Promise<boolean> {
  try {
    const devices = await navigator.mediaDevices?.enumerateDevices()
    return devices?.some((d) => d.kind === 'videoinput') ?? false
  } catch {
    return false
  }
}

export function setupWebcam(
  dialog: HTMLDialogElement,
  video: HTMLVideoElement,
  shutter: HTMLButtonElement,
  note: HTMLElement,
  onPhoto: (photo: File) => void,
): () => void {
  let stream: MediaStream | null = null

  function stop() {
    for (const track of stream?.getTracks() ?? []) track.stop()
    stream = null
    video.srcObject = null
  }

  dialog.addEventListener('close', stop)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && dialog.open) dialog.close()
  })

  shutter.addEventListener('click', () => {
    if (!stream || video.videoWidth === 0) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        dialog.close()
        if (blob) onPhoto(new File([blob], 'kamera.jpg', { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.92,
    )
  })

  return async function open() {
    note.textContent = ''
    shutter.disabled = true
    dialog.showModal()
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      // The dialog may have been closed while the permission prompt was open.
      if (!dialog.open) {
        for (const track of s.getTracks()) track.stop()
        return
      }
      stream = s
      video.srcObject = s
      await video.play()
      shutter.disabled = false
    } catch {
      note.textContent = 'Kameraa ei saatu käyttöön. Voit valita kuvan laitteelta.'
    }
  }
}
