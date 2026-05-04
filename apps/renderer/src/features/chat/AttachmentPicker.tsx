import { useRef, forwardRef, useImperativeHandle } from 'react'

export interface AttachmentPickerProps {
  onFileSelected: (file: File) => void
}

export interface AttachmentPickerRef {
  trigger: () => void
}

export const AttachmentPicker = forwardRef<AttachmentPickerRef, AttachmentPickerProps>(
  ({ onFileSelected }, ref) => {
    const fileInputRef = useRef<HTMLInputElement>(null)

    useImperativeHandle(ref, () => ({
      trigger: () => {
        fileInputRef.current?.click()
      },
    }), [])

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0]
      if (file) {
        onFileSelected(file)
      }
      // Reset input so the same file can be selected again
      event.currentTarget.value = ''
    }

    return (
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
        aria-hidden="true"
      />
    )
  }
)

AttachmentPicker.displayName = 'AttachmentPicker'
