Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "D:\IB-POS\apps\server"
shell.Run """C:\Program Files\nodejs\node.exe"" ""D:\IB-POS\apps\server\dist\src\main.js""", 0, False
