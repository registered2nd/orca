import { LOCAL_EXECUTION_HOST_ID } from '../../../../../../shared/execution-host'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { extractIpcErrorMessage } from '@/runtime/errors/ipc-error'
import { basename } from '@/lib/path'
import { downloadRuntimeFileForDefaultApp } from '@/runtime/files/reads/runtime-file-default-app-open'
import { getRelativePathInsideWorktree } from '@/runtime/files/runtime-file-routing'
import { hostStreamsGrantedFiles } from '@/runtime/files/grants/runtime-terminal-artifact-grant'
import { isPairedWebClientWindow } from '@/app-shell/chrome/desktop-window-chrome'
import type { RuntimeFileOperationArgs } from '@/runtime/files/runtime-file-client-types'

/**
 * Remote counterpart of "Open with default app": the OS can only launch a local
 * file, so the workspace copy is downloaded to a user-chosen path first.
 * False, before any download, for a granted file this client or its host cannot page; it opens in Orca instead.
 * True without a download when a newer click superseded this one.
 */
export async function downloadAndOpenRemoteTerminalFile(
  fileContext: RuntimeFileOperationArgs,
  filePath: string,
  {
    grant,
    isCurrent = () => true
  }: { grant?: { terminalArtifactGrantId: string } | null; isCurrent?: () => boolean } = {}
): Promise<boolean> {
  const name = basename(filePath) || filePath
  const { target, worktreeId } = fileContext
  if (grant) {
    if (
      // Why: a paired web client has no local file to stream into.
      isPairedWebClientWindow() ||
      target.kind !== 'environment' ||
      !worktreeId ||
      !(await hostStreamsGrantedFiles(target.environmentId))
    ) {
      // Why: a newer click made while the host answered owns the outcome, so a stale one falls back to nothing.
      return !isCurrent()
    }
    if (!isCurrent()) {
      return true
    }
  }
  try {
    const download = await downloadRuntimeFileForDefaultApp({
      target,
      filePath,
      relativePath: getRelativePathInsideWorktree(fileContext.worktreePath, filePath) ?? filePath,
      worktreeId: worktreeId ?? undefined,
      connectionId: fileContext.connectionId,
      expectedExternalSshTargetId: fileContext.expectedExternalSshTargetId,
      expectedEnvironmentPairingRevision: fileContext.expectedEnvironmentPairingRevision,
      terminalArtifactGrantId: grant?.terminalArtifactGrantId
    })
    // Why: cancelling the native save dialog is a deliberate no-op, not a failure; a newer link
    // click during the download supersedes this one.
    if (!download?.canceled && isCurrent()) {
      const opened = await window.api.shell.openFilePath(
        download?.destinationPath ?? filePath,
        LOCAL_EXECUTION_HOST_ID
      )
      // Why: the copy is saved where the user chose, so say where when no app took it.
      if (download && !opened && isCurrent()) {
        toast.error(
          translate(
            'auto.components.terminal.pane.TerminalLinkActionPopover.downloadedNoDefaultApp',
            "Saved '{{value0}}', but no app opened it.",
            { value0: download.destinationPath }
          )
        )
      }
    }
  } catch (error) {
    toast.error(
      extractIpcErrorMessage(
        error,
        translate(
          'auto.components.terminal.pane.TerminalLinkActionPopover.downloadOpenFailed',
          "Failed to download '{{value0}}'.",
          { value0: name }
        )
      )
    )
  }
  return true
}
