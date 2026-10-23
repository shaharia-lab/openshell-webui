import { isIgnored, parseGitignore, type GitignoreRule } from '@/lib/gitignore'

/** Largest file the backend accepts in one upload. */
export const MAX_UPLOAD = 64 * 1024 * 1024

/** Folders that are never uploaded, at any depth. */
export const DEFAULT_EXCLUDES = ['.git', 'node_modules', 'target', 'dist', '.venv']

/** A local file and its path relative to the drop or the picked folder. */
export interface UploadItem {
  path: string
  file: File
}

export interface UploadPlan {
  files: UploadItem[]
  /** Folders to create with `mkdir -p`; none is a prefix of another. */
  dirs: string[]
  totalBytes: number
  /** Files left out by the default excludes or a `.gitignore`. */
  excluded: number
  tooLarge: UploadItem[]
  /** Top-level names of what was picked or dropped. */
  roots: string[]
}

const excludedByDefault = (path: string) =>
  path.split('/').some((seg) => DEFAULT_EXCLUDES.includes(seg))

/** Items from an `<input webkitdirectory>` selection. */
export function fromFileList(files: Iterable<File>): UploadItem[] {
  return [...files].map((file) => ({ path: file.webkitRelativePath || file.name, file }))
}

/**
 * Walks dropped files and folders. Call it inside the drop handler: the
 * entries must be taken before the event returns. Excluded folders are not
 * read at all, so a dropped project does not walk its node_modules.
 */
export function fromDataTransfer(dt: DataTransfer): {
  hasFolder: boolean
  read: () => Promise<{ items: UploadItem[]; dirs: string[] }>
} {
  const entries = [...dt.items]
    .filter((i) => i.kind === 'file')
    .map((i) => i.webkitGetAsEntry())
    .filter((e): e is FileSystemEntry => e !== null)
  const read = async () => {
    const items: UploadItem[] = []
    const dirs: string[] = []
    const walk = async (entry: FileSystemEntry, path: string): Promise<void> => {
      if (entry.isFile) {
        const file = await new Promise<File>((ok, fail) =>
          (entry as FileSystemFileEntry).file(ok, fail),
        )
        items.push({ path, file })
      } else if (entry.isDirectory) {
        if (DEFAULT_EXCLUDES.includes(entry.name)) return
        dirs.push(path)
        const reader = (entry as FileSystemDirectoryEntry).createReader()
        // readEntries returns the children in batches until it returns none.
        for (;;) {
          const batch = await new Promise<FileSystemEntry[]>((ok, fail) =>
            reader.readEntries(ok, fail),
          )
          if (!batch.length) break
          for (const child of batch) await walk(child, `${path}/${child.name}`)
        }
      }
    }
    for (const e of entries) await walk(e, e.name)
    return { items, dirs }
  }
  return { hasFolder: entries.some((e) => e.isDirectory), read }
}

/**
 * Applies the default excludes and every `.gitignore` in the selection,
 * then works out the folders to create. `emptyDirs` are folders known to
 * exist even without files (from a drop).
 */
export async function planUpload(
  items: UploadItem[],
  emptyDirs: string[] = [],
): Promise<UploadPlan> {
  const candidates = items.filter((i) => !excludedByDefault(i.path))
  const rules: GitignoreRule[] = []
  const ignoreFiles = candidates
    .filter((i) => i.path === '.gitignore' || i.path.endsWith('/.gitignore'))
    .sort((a, b) => a.path.split('/').length - b.path.split('/').length)
  for (const g of ignoreFiles) {
    const base = g.path.slice(0, -'.gitignore'.length)
    // A .gitignore inside an ignored folder does not apply.
    if (base && isIgnored(rules, base, true)) continue
    rules.push(...parseGitignore(await g.file.text(), base))
  }

  const kept = candidates.filter((i) => !isIgnored(rules, i.path))
  const files = kept.filter((i) => i.file.size <= MAX_UPLOAD)
  const tooLarge = kept.filter((i) => i.file.size > MAX_UPLOAD)

  const dirSet = new Set<string>()
  for (const f of files) {
    const slash = f.path.lastIndexOf('/')
    if (slash > 0) dirSet.add(f.path.slice(0, slash))
  }
  for (const d of emptyDirs) if (!excludedByDefault(d) && !isIgnored(rules, d, true)) dirSet.add(d)
  const all = [...dirSet].sort()
  const dirs = all.filter((d) => !all.some((o) => o.startsWith(d + '/')))

  return {
    files,
    dirs,
    totalBytes: files.reduce((n, f) => n + f.file.size, 0),
    excluded: items.length - kept.length,
    tooLarge,
    roots: [...new Set([...items.map((i) => i.path), ...emptyDirs].map((p) => p.split('/')[0]))],
  }
}
