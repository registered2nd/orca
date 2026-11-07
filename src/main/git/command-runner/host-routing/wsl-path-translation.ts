import { toWindowsWslPath, toWindowsWslUncPath } from '../../../../shared/file-access/wsl-paths'
import { parseWslPath } from '../../../wsl/filesystem/unc-path-access'
import {
  wslAutomountRootFor,
  wslDrivePathUnderRoots
} from '../../../wsl/filesystem/wsl-automount-root'

/** UNC paths become native Linux paths; drive paths stay for the guest to resolve (wsl-guest-drive-path.ts). */
export function translateUncArgForWsl(arg: string): string {
  return parseWslPath(arg)?.linuxPath ?? arg
}

/** Map Linux worktree output to UNC paths Node can open on Windows. */
export function translateWslOutputPaths(
  output: string,
  originalCwd: string,
  options: { wslDistro?: string } = {}
): string {
  return output.replace(/(?<=worktree )(\/.+)$/gm, (linuxPath: string) =>
    translateWslOutputPath(linuxPath, originalCwd, options)
  )
}

/** One absolute Linux path from WSL Git output, as a path Node can open on Windows. */
export function translateWslOutputPath(
  linuxPath: string,
  originalCwd: string,
  options: { wslDistro?: string } = {}
): string {
  const wsl = parseWslPath(originalCwd)
  const distro = wsl?.distro ?? options.wslDistro
  if (!distro || !linuxPath.startsWith('/')) {
    return linuxPath
  }
  // A drive repo's own output names drives under its distro's automount root; drvfs letters are lowercase.
  const root = wslAutomountRootFor(distro)
  const drive =
    wsl || !/^[a-z](?:\/|$)/.test(linuxPath.slice(root.length))
      ? null
      : wslDrivePathUnderRoots(linuxPath, [root])
  if (drive) {
    return drive
  }
  // Why: a repo saved under the distro's view, in the distro or on a drive, keeps its /mnt/<drive>
  // worktrees there: worktree ids use that spelling, and their terminals, git and agent sessions stay
  // in WSL. A drive repo routed through WSL git keeps drive paths.
  const toWindows = wsl ? toWindowsWslUncPath : toWindowsWslPath
  return toWindows(linuxPath, distro)
}
