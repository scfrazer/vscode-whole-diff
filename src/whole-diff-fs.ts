/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// copied and cut down from
// https://github.com/microsoft/vscode-extension-samples/blob/main/fsprovider-sample/src/fileSystemProvider.ts

import * as vscode from "vscode";
import * as path from "path";

import { DiffType, Git } from "./types";

let git: Git;

class File implements vscode.FileStat {
  type: vscode.FileType;
  ctime: number;
  mtime: number;
  size: number;

  data?: Uint8Array;

  constructor() {
    this.type = vscode.FileType.File;
    this.ctime = Date.now();
    this.mtime = Date.now();
    this.size = 0;
  }
}

export class WholeDiffFS implements vscode.FileSystemProvider {
  // --- manage file metadata

  stat(uri: vscode.Uri): vscode.FileStat {
    console.log("stat called");
    // no stat
    return new File();
  }

  readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
    // no listing of files
    return [];
  }

  // --- manage file contents

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    // todo put the git stuff here
    return strToA(await generateDiff(uri));
  }

  writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean }
  ): void {
    throw vscode.FileSystemError.NoPermissions("read-only file system");
  }

  // --- manage files/folders

  rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { overwrite: boolean }
  ): void {
    throw vscode.FileSystemError.NoPermissions("read-only file system");
  }

  delete(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions("read-only file system");
  }

  createDirectory(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions("read-only file system");
  }

  // events, we fire an event every time the user requests a diff
  private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();

  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> =
    this._emitter.event;

  watch(_resource: vscode.Uri): vscode.Disposable {
    // ignore, no changes
    return new vscode.Disposable(() => {});
  }

  public fireChangeEvent(uri: vscode.Uri) {
    this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }
}

function strToA(str: string): Uint8Array {
  const buf = Buffer.from(str, "utf-8");
  return new Uint8Array(buf);
}

async function generateDiff(uri: vscode.Uri): Promise<string> {
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  if (!cwd) {
    vscode.window.showErrorMessage("Whole Diff cannot find a workspace folder");
    throw vscode.FileSystemError.Unavailable("Whole Diff cannot find cwd");
  }

  if (!git) {
    git = vscode.extensions.getExtension("vscode.git")?.exports.model
      .git as Git;
    if (!git) {
      vscode.window.showErrorMessage("Whole Diff cannot find git");
      throw vscode.FileSystemError.Unavailable("Whole Diff cannot find git");
    }
  }

  const args = extractDiffArgs(uri);
  const result = await git.exec(cwd, args);
  if (result.exitCode !== 0) {
    console.warn(result);
    vscode.window.showErrorMessage("Whole Diff cannot generate diff");
    throw vscode.FileSystemError.Unavailable("Whole Diff cannot generate diff");
  }

  return result.stdout;
}

function extractDiffArgs(uri: vscode.Uri): string[] {
  const diffType = path.basename(uri.path);

  if (diffType === <DiffType>"staged changes.diff") {
    return ["diff", "--cached"];
  }

  if (diffType === <DiffType>"working tree.diff") {
    return ["diff"];
  }

  const sha = diffType.match(/sha-([0-9a-fA-F]*)\.diff/)?.[1];
  if (sha) {
    return ["diff", `${sha}~1..${sha}`];
  }

  throw vscode.FileSystemError.FileNotFound(`Cannot find diff for ${diffType}`);
}
