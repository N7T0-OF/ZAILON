import { useEffect, useState } from 'react'
import { Archive, CheckCircle2, Download, File, Folder, FolderOpen, HardDrive, RefreshCw, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { native, saveFiveMProfileArchive, type FiveMProfileVerification } from '../lib/native'
import { fiveMModLabel, formatFiveMSize } from '../lib/fivemMods'
import { fiveMCheckLabel, fiveMProfileVerdict, fiveMVerifySummary } from '../lib/fivemVerify'
import type { Game } from '../types'

/**
 * Contenu RÉEL de `FiveM.app/mods` (spec « FiveM Profiles » §1-4, §11-12).
 * FiveM n'a pas de mods « activables » : ce panneau liste le dossier tel quel,
 * avec « Ouvrir le dossier » et une suppression SÉCURISÉE limitée aux entrées
 * de premier niveau. Jamais de système virtuel d'activation.
 */
export function FiveMModsPanel({ game }: { game: Game }) {
  const loadFiveMMods = useStore(state => state.loadFiveMMods)
  const fiveMModsIndex = useStore(state => state.fiveMModsIndex)
  const recordNotice = useStore(state => state.recordNotice)
  const [busy, setBusy] = useState<string | null>(null)
  const [verification, setVerification] = useState<FiveMProfileVerification | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [exporting, setExporting] = useState(false)

  const listing = game.installDirectory ? fiveMModsIndex[game.id] : undefined
  const modsPath = listing?.modsPath || null

  useEffect(() => {
    if (game.installDirectory && game.provider === 'FiveM Client') {
      void loadFiveMMods(game.id)
    }
  }, [game.id, game.installDirectory, game.provider, loadFiveMMods])

  if (game.provider !== 'FiveM Client') return null

  const entries = listing?.entries || []

  const removeEntry = async (relativePath: string, name: string) => {
    if (!game.installDirectory) return
    if (!window.confirm(`Supprimer « ${name} » du dossier FiveM.app/mods ?\n\nL'élément sera définitivement effacé du PC.`)) return
    setBusy(relativePath)
    try {
      const result = await native.removeFiveMMod(game.installDirectory, relativePath)
      const freed = formatFiveMSize(result.freedBytes)
      recordNotice(`${name} supprimé (${result.removedFiles} fichier${result.removedFiles !== 1 ? 's' : ''}, ${freed} libérés).`)
      void loadFiveMMods(game.id)
    } catch (error) {
      recordNotice(String(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-xl border border-sky-300/18 bg-sky-300/[0.035] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <HardDrive size={13} className="text-sky-200/70" />
        <p className="text-[11px] font-semibold text-sky-100/75">Contenu de FiveM.app/mods</p>
        <span className="rounded-full bg-white/[0.035] px-2 py-0.5 text-[10px] text-white/35">
          {entries.length} élément{entries.length !== 1 ? 's' : ''} · {formatFiveMSize(entries.reduce((sum, entry) => sum + entry.sizeBytes, 0))}
        </span>
        <button
          type="button"
          onClick={() => void loadFiveMMods(game.id)}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[10px] text-white/55 hover:bg-white/[0.05]"
          title="Relire le dossier mods"
        >
          <RefreshCw size={12} />Actualiser
        </button>
        <button
          type="button"
          disabled={verifying || !game.installDirectory}
          onClick={() => void verifyProfile()}
          className="flex items-center gap-1.5 rounded-lg border border-sky-300/18 px-2.5 py-1.5 text-[10px] font-semibold text-sky-100/70 hover:bg-sky-300/[0.07] disabled:opacity-40"
          title="Vérifier l'intégrité du profil FiveM (racine, CitizenFX.ini, mods, plugins, ReShade)"
        >
          {verifying ? <RefreshCw size={12} className="animate-spin" /> : <ShieldCheck size={12} />}Vérifier le profil
        </button>
        <button
          type="button"
          disabled={exporting || !game.installDirectory}
          onClick={() => void exportProfile()}
          className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[10px] text-white/55 hover:bg-white/[0.05] disabled:opacity-40"
          title="Exporter le profil : manifest + mods + plugins + CitizenFX.ini + ReShade, sans FiveM.exe ni cache/logs"
        >
          {exporting ? <RefreshCw size={12} className="animate-spin" /> : <Archive size={12} />}Exporter le profil
        </button>
      </div>

      {modsPath ? (
        <p className="mt-2 truncate font-mono text-[10px] text-white/28" title={modsPath}>{modsPath}</p>
      ) : (
        <p className="mt-2 text-[11px] text-amber-100/60">Dossier mods non détecté — lancez FiveM une première fois pour qu'il génère sa structure.</p>
      )}

      {entries.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {entries.map(entry => (
            <li key={`${entry.kind}:${entry.relativePath}`} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/15 px-3 py-2">
              {entry.kind === 'folder'
                ? <Folder size={14} className="shrink-0 text-sky-200/60" />
                : <File size={14} className="shrink-0 text-white/35" />}
              <span className="min-w-0 flex-1 truncate text-[11px] text-white/70" title={entry.relativePath}>{fiveMModLabel(entry)}</span>
              <span className="shrink-0 text-[10px] text-white/34">{formatFiveMSize(entry.sizeBytes)}</span>
              {entry.modifiedAt !== null && (
                <span className="hidden shrink-0 text-[10px] text-white/22 sm:inline">
                  {new Date(entry.modifiedAt * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                </span>
              )}
              {entry.kind === 'folder' && (
                <button
                  type="button"
                  onClick={() => modsPath && void native.openPath(`${modsPath}/${entry.relativePath}`)}
                  className="shrink-0 rounded-md p-1.5 text-white/35 hover:bg-white/[0.06] hover:text-white"
                  title="Ouvrir le dossier"
                >
                  <FolderOpen size={12} />
                </button>
              )}
              <button
                type="button"
                disabled={busy === entry.relativePath}
                onClick={() => void removeEntry(entry.relativePath, entry.name)}
                className="shrink-0 rounded-md p-1.5 text-white/30 hover:bg-red-400/10 hover:text-red-200 disabled:opacity-40"
                title={`Supprimer ${entry.name}`}
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : modsPath ? (
        <p className="mt-3 text-[11px] text-white/32">Le dossier mods est vide. Déposez-y vos packs (dossiers ou fichiers) puis actualisez.</p>
      ) : null}

      {verification && <ProfileVerificationResult verification={verification} />}

      <p className="mt-3 text-[10px] leading-relaxed text-white/28">
        ZAILON n'active ni ne désactive rien : il organise uniquement ce que vous choisissez de gérer. La suppression est limitée aux éléments de premier niveau du dossier mods.
      </p>
    </div>
  )

  async function verifyProfile() {
    if (!game.installDirectory) return
    setVerifying(true)
    try {
      setVerification(await native.verifyFiveMProfile(game.installDirectory))
    } catch (error) {
      recordNotice(String(error))
    } finally {
      setVerifying(false)
    }
  }

  async function exportProfile() {
    if (!game.installDirectory) return
    setExporting(true)
    try {
      const destination = await saveFiveMProfileArchive(`${game.name} — Profil`)
      if (!destination) return
      const result = await native.exportFiveMProfile(game.installDirectory, destination, game.name)
      recordNotice(`Profil FiveM exporté (${result.files} fichier${result.files !== 1 ? 's' : ''}, ${formatFiveMSize(result.bytes)}).`)
    } catch (error) {
      recordNotice(String(error))
    } finally {
      setExporting(false)
    }
  }
}

function ProfileVerificationResult({ verification }: { verification: FiveMProfileVerification }) {
  const verdict = fiveMProfileVerdict(verification.checks)
  const tone = verdict === 'ok' ? 'text-emerald-200' : verdict === 'missing' ? 'text-red-200' : 'text-amber-200'
  const Icon = verdict === 'ok' ? CheckCircle2 : ShieldAlert
  return (
    <div className="mt-3 rounded-lg border border-white/[0.06] bg-black/15 p-3">
      <p className={`flex items-center gap-1.5 text-[11px] font-semibold ${tone}`}>
        <Icon size={13} />{fiveMVerifySummary(verification.checks)}
      </p>
      <ul className="mt-2 space-y-1">
        {verification.checks.map(check => (
          <li key={check.id} className="flex items-center gap-2 text-[10px]">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${check.ok ? 'bg-emerald-300/70' : 'bg-red-300/70'}`} />
            <span className={`font-medium ${check.ok ? 'text-white/55' : 'text-red-100/75'}`}>{fiveMCheckLabel(check.id)}</span>
            {check.detail && <span className="min-w-0 flex-1 truncate text-white/30" title={check.detail}>{check.detail}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
