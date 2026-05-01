import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const productName = pkg.build?.productName ?? 'Markwand'
const version = pkg.version
const distDir = path.join(root, 'dist')
const guidePath = path.join(root, 'build', '처음 실행 안내.html')
const stageRoot = path.join(distDir, '.free-zip')

const targets = [
  { arch: 'arm64', appDir: path.join(distDir, 'mac-arm64', `${productName}.app`) },
  { arch: 'x64', appDir: path.join(distDir, 'mac', `${productName}.app`) },
]

fs.rmSync(stageRoot, { recursive: true, force: true })
fs.mkdirSync(stageRoot, { recursive: true })

for (const target of targets) {
  if (!fs.existsSync(target.appDir)) {
    console.warn(`[package-mac-free] skip ${target.arch}; app not found: ${target.appDir}`)
    continue
  }

  const stageDir = path.join(stageRoot, target.arch)
  const bundleDir = path.join(stageDir, `${productName} Free Install`)
  fs.mkdirSync(bundleDir, { recursive: true })

  const stagedApp = path.join(bundleDir, `${productName}.app`)
  execFileSync('ditto', [target.appDir, stagedApp], { stdio: 'inherit' })
  fs.copyFileSync(guidePath, path.join(bundleDir, 'First Run Guide.html'))

  const zipName = `${productName}-${version}-${target.arch}-free.zip`
  const zipPath = path.join(distDir, zipName)
  fs.rmSync(zipPath, { force: true })
  execFileSync(
    'ditto',
    ['-c', '-k', '--sequesterRsrc', '--keepParent', `${productName} Free Install`, zipPath],
    { cwd: stageDir, stdio: 'inherit' }
  )
  console.log(`[package-mac-free] wrote ${path.relative(root, zipPath)}`)
}

fs.rmSync(stageRoot, { recursive: true, force: true })
