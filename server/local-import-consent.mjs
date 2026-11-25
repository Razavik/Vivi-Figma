import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const prompt = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
try {
	[void]$owner.Handle
	$paragraph = [Environment]::NewLine + [Environment]::NewLine
	$text = "Разрешить Vivi MCP читать HTML, стили и другие веб-ресурсы из папки?" + $paragraph + $env:VIVI_CONSENT_FOLDER + $paragraph + "Подтвердите только если вы запустили импорт в Figma."
	$result = [System.Windows.Forms.MessageBox]::Show($owner, $text, 'Vivi MCP', [System.Windows.Forms.MessageBoxButtons]::YesNo, [System.Windows.Forms.MessageBoxIcon]::Question, [System.Windows.Forms.MessageBoxDefaultButton]::Button2)
	if ($result -eq [System.Windows.Forms.DialogResult]::Yes) { [Console]::Write('allow') }
} finally {
	$owner.Dispose()
}
`;
let prompting = false;

export async function confirmImportFolder(folder, signal) {
	if (process.platform !== "win32") throw new Error("Выберите папку в режиме «Файл» или добавьте её в VIVI_HTML_IMPORT_ROOTS.");
	if (prompting) throw new Error("Сначала ответьте на открытый запрос Windows.");
	prompting = true;
	try {
		const powershell = join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
		const { stdout } = await run(powershell, ["-NoProfile", "-NonInteractive", "-STA", "-EncodedCommand", Buffer.from(prompt, "utf16le").toString("base64")], {
			env: { ...process.env, VIVI_CONSENT_FOLDER: folder },
			windowsHide: true,
			timeout: 120_000,
			signal,
		});
		return stdout.trim() === "allow";
	} catch (err) {
		if (signal?.aborted) throw signal.reason;
		throw new Error("Не удалось подтвердить доступ в Windows. Выберите папку в режиме «Файл».");
	} finally {
		prompting = false;
	}
}
