import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, posix } from 'node:path'
import type { Repo } from '../../../shared/repo-types'
import { getStoredRepoSshConnectionId } from '../../repo-execution-host'
import { getSshFilesystemProvider } from '../../providers/ssh-filesystem-dispatch'
import type { IFilesystemProvider } from '../../providers/types'
import { OrchestrationError } from '../orchestration/orchestration-error'

export type TeamHostFiles = {
  read: (path: string) => Promise<string | null>
  write: (path: string, content: string) => Promise<void>
  /** Names in a directory, or [] when it does not exist. */
  list: (dir: string) => Promise<string[]>
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && /ENOENT|no such file|not found/i.test(error.message)
}

async function remoteMkdirp(provider: IFilesystemProvider, dir: string): Promise<void> {
  const parts = dir.split('/').filter(Boolean)
  let current = dir.startsWith('/') ? '' : '.'
  for (const part of parts) {
    current = `${current}/${part}`
    try {
      await provider.createDir(current)
    } catch {
      // Already exists, or the parent is not ours to create; the write below reports real failures.
    }
  }
}

/**
 * Files on the execution host. Why no local fallback for SSH repos: writing a remote member's
 * files to this machine would silently hand the agent nothing.
 */
export function teamHostFilesFor(repo: Repo): TeamHostFiles {
  const connectionId = getStoredRepoSshConnectionId(repo)
  if (!connectionId) {
    return {
      read: async (path) => {
        try {
          return await readFile(path, 'utf8')
        } catch (error) {
          if (isMissingFileError(error)) {
            return null
          }
          throw error
        }
      },
      write: async (path, content) => {
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, content, 'utf8')
      },
      list: async (dir) => {
        try {
          return await readdir(dir)
        } catch (error) {
          if (isMissingFileError(error)) {
            return []
          }
          throw error
        }
      }
    }
  }
  const provider = getSshFilesystemProvider(connectionId)
  if (!provider) {
    throw new OrchestrationError(
      'unverifiable',
      `The SSH connection for ${repo.displayName} is not available; reconnect before starting members.`
    )
  }
  return {
    read: async (path) => {
      try {
        return (await provider.readFile(path)).content
      } catch (error) {
        if (isMissingFileError(error)) {
          return null
        }
        throw error
      }
    },
    write: async (path, content) => {
      await remoteMkdirp(provider, posix.dirname(path))
      await provider.writeFile(path, content)
    },
    list: async (dir) => {
      try {
        return (await provider.readDir(dir)).map((entry) => entry.name)
      } catch (error) {
        if (isMissingFileError(error)) {
          return []
        }
        throw error
      }
    }
  }
}

export function joinWorkspacePath(root: string, relative: string): string {
  const separator = root.includes('\\') && !root.includes('/') ? '\\' : '/'
  return `${root.replace(/[\\/]+$/, '')}${separator}${relative.split('/').join(separator)}`
}
