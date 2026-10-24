# Terminal and files

This page covers the web terminal and the file browser of a sandbox. It is for anyone who wants
to run commands in a sandbox or move files in and out of it from the browser.

Both need a sandbox in the **Ready** phase. Commands and file operations run inside the sandbox,
under its policy.

## Terminal

### Open a terminal

Use any of these:

- The **Terminal** button on the sandbox detail page header.
- The **Terminal** tab of the sandbox.
- **Open terminal** in the **⋯** menu of the sandbox list.
- **Terminal in <name>** in the command palette (`Ctrl+K` or `⌘+K`).

The terminal connects as soon as the tab opens. It starts a login shell: `bash` when the image
has it, otherwise `sh`.

CLI equivalent: `openshell sandbox exec -n my-sandbox --tty -- /bin/bash -l`.

### Terminal toolbar

| Control | What it does |
|---|---|
| Status badge | **Not connected**, **Connecting**, **Connected**, **Exited**, **Closed** or **Error**, with details such as the exit code |
| **Command (empty: login shell)** | A command to run instead of the shell |
| **Connect**, **Run** or **Restart** | Starts a new session. **Run** runs the command you typed; **Restart** replaces the current session |
| Disconnect icon | Ends the current session |
| Reconnect icon | Starts a new login shell after a session ended |
| Full screen icon | Fills the window. Press `Shift+Esc` to exit full screen |

### Run a one-off command

1. Type a command in **Command (empty: login shell)**, for example `ls -la /sandbox`.
2. Press `Enter` or click **Run**.

The command runs in a terminal through `/bin/sh -c`. When it ends, the status shows
**Exited** and the exit code.

CLI equivalent: `openshell sandbox exec -n my-sandbox -- ls -la /sandbox`.

### Copy and paste

| Keys | Action |
|---|---|
| `Ctrl+C` with text selected | Copies the selection |
| `Ctrl+C` with nothing selected | Sends `^C` to the program (interrupt) |
| `Ctrl+Shift+C` | Copies the selection |
| `Ctrl+Shift+V` | Pastes from the clipboard |
| `⌘+C` (macOS) | Copies the selection |

Your browser may ask for permission to read the clipboard the first time you paste.

### Programs that capture the mouse

Some programs capture the mouse, for example Claude Code's full-screen UI. Then a plain drag goes
to the program and does not select text.

- Hold `Shift` while you drag to select text anyway (`Option` on macOS).
- For Claude Code, set `CLAUDE_CODE_DISABLE_MOUSE=1` in the sandbox environment. Plain drag
  selection then works again. Set it in **Environment** when you create the sandbox, or in the
  template you create it from. See [Templates](templates.md).

### Sessions are not persistent

Each visit to the **Terminal** tab starts a new session. Closing the browser tab, leaving the
page or refreshing it ends the shell and everything running in its foreground. This matches how
OpenShell runs exec sessions.

> [!TIP]
> To keep work running across visits, start `tmux` (or `screen`) inside the sandbox, if the image
> has it, and reattach in the next session.

### Read-only mode

In read-only mode the terminal tab shows **Terminal unavailable**: "The WebUI runs in read-only
mode, which refuses terminal sessions." The backend refuses the connection as well. Every
terminal session is recorded in the audit log (without its input or output).

## File browser

Open the **Files** tab of a ready sandbox. The browser starts in `/sandbox`.

CLI equivalent: `openshell sandbox upload` and `openshell sandbox download`.

### Browse

- Click a folder to open it. Click the up arrow (**Parent folder**) to go up.
- Click a part of the path to jump to it. Double-click the path to type one, then press
  `Enter`.
- Click the refresh icon to reload the folder.

The table shows **Name**, **Size**, **Modified**, **Mode** and **Owner**. Symbolic links show
their target.

### Preview and edit

1. Click a file, or choose **Preview** in its **⋯** menu.
2. The dialog shows the file's text.
3. To change it, click **Edit**, make your changes, and click **Save**.

- Files over 1 MiB show **Too large to preview**. Download them instead.
- Binary files show "This is a binary file. Download it to open it."
- **Edit** is not available in read-only mode.

### Download

Choose **Download** in a file's **⋯** menu, or click **Download** in the preview dialog. The
limit is 64 MiB per file.

### Upload files

1. Click **Upload** and pick one or more files, or drag files onto the browser.
2. The files go into the folder you are viewing.

If a file with the same name exists, the WebUI asks you to confirm **Replace**. Each file can be
up to 64 MiB.

### Upload a folder

1. Click **Upload folder** and pick a folder, or drag a folder onto the browser.
2. Review the confirmation. It shows the file count, total size, what was skipped, and which
   names already exist.
3. Click **Upload**.

The folder structure is kept. These are skipped:

| Skipped | Why |
|---|---|
| `.git`, `node_modules`, `target`, `dist`, `.venv` folders, at any depth | Default excludes |
| Paths matched by any `.gitignore` in the uploaded folder | Follows git's rules |
| Files over 64 MiB | Upload limit |

A progress bar shows the files done. Click **Cancel** to stop starting new files; files already
in flight finish. Failed files are listed under the bar.

### Create a folder

1. Click **New folder**.
2. Enter a **Name**. Use `/` for nested folders, such as `a/b/c`. `..` is not allowed.
3. Click **Create**. Parent folders are created as needed.

### Delete

Choose **Delete** in the **⋯** menu of a file or folder. To delete a folder, you type its name
to confirm. A folder is deleted with everything in it. You cannot undo this.

### Read-only mode

In read-only mode you can still browse, preview and download. **Upload**, **Upload folder**,
**New folder**, **Edit** and **Delete** are disabled.

## Related

- [Sandboxes](sandboxes.md)
- [Templates](templates.md)
- [Security](security.md)
- [Troubleshooting](troubleshooting.md)
