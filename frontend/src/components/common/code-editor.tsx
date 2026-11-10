import { json } from '@codemirror/lang-json'
import { yaml } from '@codemirror/lang-yaml'
import CodeMirror from '@uiw/react-codemirror'
import { useTheme } from '@/lib/theme-context'

import { cn } from '@/lib/utils'

const languages = { yaml: [yaml()], json: [json()], text: [] }

interface CodeEditorProps {
  value: string
  onChange?: (value: string) => void
  language?: keyof typeof languages
  readOnly?: boolean
  /**
   * CSS height, e.g. "24rem". A percentage fills the parent, which must have a
   * definite height; the editor then scrolls inside it.
   */
  height?: string
  placeholder?: string
  className?: string
  'aria-label'?: string
}

export function CodeEditor({
  value,
  onChange,
  language = 'yaml',
  readOnly,
  height = '24rem',
  placeholder,
  className,
  'aria-label': ariaLabel,
}: CodeEditorProps) {
  const { resolvedTheme } = useTheme()
  return (
    <div className={cn('overflow-hidden rounded-lg border text-xs', className)}>
      <CodeMirror
        // @uiw wraps the editor in an unsized div; without this a percentage
        // height resolves to auto, the editor grows to fit its content and the
        // outer overflow-hidden clips it, leaving no way to scroll.
        className={height.endsWith('%') ? 'h-full' : undefined}
        value={value}
        onChange={onChange}
        extensions={languages[language]}
        theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
        readOnly={readOnly}
        editable={!readOnly}
        height={height}
        placeholder={placeholder}
        aria-label={ariaLabel}
        basicSetup={{ foldGutter: true, highlightActiveLine: !readOnly, autocompletion: false }}
      />
    </div>
  )
}
