import { describe, expect, it } from 'vitest'

import { MAX_UPLOAD, fromFileList, planUpload, type UploadItem } from '../folder-upload'

const item = (path: string, content = 'x', size?: number): UploadItem => {
  const file = new File([content], path.split('/').pop()!)
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size })
  return { path, file }
}

describe('folder upload plan', () => {
  it('reads webkitRelativePath', () => {
    const f = new File(['a'], 'a.ts')
    Object.defineProperty(f, 'webkitRelativePath', { value: 'proj/src/a.ts' })
    expect(fromFileList([f, new File(['b'], 'b.ts')]).map((i) => i.path)).toEqual([
      'proj/src/a.ts',
      'b.ts',
    ])
  })

  it('keeps structure, skips default excludes and .gitignore, and finds leaf folders', async () => {
    const plan = await planUpload([
      item('proj/.gitignore', '*.log\nsecret/\n'),
      item('proj/README.md', 'hello'),
      item('proj/src/main.rs', 'fn main() {}'),
      item('proj/src/deep/mod.rs'),
      item('proj/app.log'),
      item('proj/secret/key'),
      item('proj/.git/HEAD'),
      item('proj/node_modules/x/index.js'),
      item('proj/target/debug/bin'),
      item('proj/web/.gitignore', 'gen/'),
      item('proj/web/gen/a.ts'),
      item('proj/web/b.ts'),
      item('proj/big.bin', '', MAX_UPLOAD + 1),
    ])
    expect(plan.files.map((f) => f.path).sort()).toEqual([
      'proj/.gitignore',
      'proj/README.md',
      'proj/src/deep/mod.rs',
      'proj/src/main.rs',
      'proj/web/.gitignore',
      'proj/web/b.ts',
    ])
    expect(plan.dirs).toEqual(['proj/src/deep', 'proj/web'])
    expect(plan.excluded).toBe(6)
    expect(plan.tooLarge.map((f) => f.path)).toEqual(['proj/big.bin'])
    expect(plan.roots).toEqual(['proj'])
    expect(plan.totalBytes).toBe(plan.files.reduce((n, f) => n + f.file.size, 0))
  })

  it('creates empty dropped folders that are not excluded', async () => {
    const plan = await planUpload([item('p/a.txt')], ['p', 'p/empty', 'p/dist'])
    expect(plan.dirs).toEqual(['p/empty'])
  })
})
