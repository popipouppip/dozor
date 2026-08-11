' Silent launcher for DOZOR tasks.
' Task Scheduler calls: wscript.exe tiho.vbs <script.ps1> [args...]
' WScript.Shell.Run with window style 0 starts PowerShell with no console window at all,
' unlike -WindowStyle Hidden which still flashes a window for a moment.

Dim shell, cmd, i
Set shell = CreateObject("WScript.Shell")

If WScript.Arguments.Count = 0 Then WScript.Quit 1

cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & WScript.Arguments(0) & """"

For i = 1 To WScript.Arguments.Count - 1
    cmd = cmd & " " & WScript.Arguments(i)
Next

' 0 = hidden window, False = do not wait for it to finish
shell.Run cmd, 0, False
