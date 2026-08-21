import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

const root = resolve(process.cwd())
const targets = [
  resolve(root, 'src', 'visual-profiles'),
  resolve(root, 'src-tauri', 'src', 'visual_profiles.rs'),
]
const allowedExtensions = new Set(['.rs', '.ts', '.tsx'])
const forbidden = [
  'CreateRemoteThread',
  'WriteProcessMemory',
  'SetWindowsHookEx',
  'OpenProcess',
  'ReadProcessMemory',
  'VirtualAllocEx',
  'QueueUserAPC',
  'D3D11CreateDevice',
  'vkCreateInstance',
  'IDXGISwapChain',
  'EasyAntiCheat_EOS',
]

function filesAt(path) {
  if (!statSync(path).isDirectory()) return [path]
  return readdirSync(path).flatMap(name => filesAt(join(path, name)))
}

const files = targets.flatMap(filesAt).filter(path => allowedExtensions.has(extname(path)))
const failures = []
for (const path of files) {
  const source = readFileSync(path, 'utf8')
  for (const symbol of forbidden) {
    if (source.includes(symbol)) failures.push(`${relative(root, path)} contient ${symbol}`)
  }
}

const backend = readFileSync(resolve(root, 'src-tauri', 'src', 'visual_profiles.rs'), 'utf8')
for (const required of ['visual_root(app)', 'last-known-safe-display-state.json', 'restore_for_shutdown', 'changes_game_files: false', 'injects_code: false']) {
  if (!backend.includes(required)) failures.push(`Contrat requis absent du backend : ${required}`)
}

if (failures.length) {
  console.error('Échec de l’audit statique Visual Profiles :')
  failures.forEach(failure => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`Audit statique Visual Profiles réussi sur ${files.length} fichier(s).`)
console.log('Aucune API d’injection, de mémoire de processus, de hook graphique ou d’interaction EAC détectée.')
