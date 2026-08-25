; Violet Enterprise NSIS hooks.
; Tauri creates the normal Start Menu entry. These hooks add a predictable
; Desktop shortcut for operators and remove it again with the uninstaller.
; The filename is kept in sync with tauri.conf.json > mainBinaryName.

!macro NSIS_HOOK_POSTINSTALL
  CreateShortCut "$DESKTOP\Violet Enterprise.lnk" "$INSTDIR\Violet Enterprise.exe"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$DESKTOP\Violet Enterprise.lnk"
!macroend