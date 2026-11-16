; FTune joins "Open with" for the audio files it plays. Offered only, never
; made the default: the extensions' own default stays the user's choice (the
; association electron-builder would write takes it over). The extension list
; matches electron/audio-types.ts (PLAYABLE_AUDIO); a test keeps them in step.

!macro FTuneOfferFor EXT
  WriteRegStr SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "FTune.Audio" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".${EXT}" ""
!macroend

!macro FTuneWithdrawFrom EXT
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "FTune.Audio"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "ByTune.Audio"
!macroend

!macro FTuneEachAudioExtension MACRO
  !insertmacro ${MACRO} "mp3"
  !insertmacro ${MACRO} "m4a"
  !insertmacro ${MACRO} "aac"
  !insertmacro ${MACRO} "flac"
  !insertmacro ${MACRO} "ogg"
  !insertmacro ${MACRO} "oga"
  !insertmacro ${MACRO} "opus"
  !insertmacro ${MACRO} "wav"
  !insertmacro ${MACRO} "webm"
!macroend

!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\FTune.Audio" "" "Audio file"
  WriteRegStr SHELL_CONTEXT "Software\Classes\FTune.Audio\DefaultIcon" "" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\FTune.Audio\shell\open" "" "Play with FTune"
  WriteRegStr SHELL_CONTEXT "Software\Classes\FTune.Audio\shell\open\command" "" '"$appExe" "%1"'
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$appExe" "%1"'
  !insertmacro FTuneEachAudioExtension FTuneOfferFor
  ; Pre-authorize FTune and the Remote Host port (8765) in Windows Defender Firewall
  ; silently during setup so launching FTune never triggers firewall popups.
  nsExec::ExecToStack 'netsh advfirewall firewall delete rule name="FTune"'
  Pop $0
  Pop $1
  nsExec::ExecToStack 'netsh advfirewall firewall delete rule name="FTune Remote Host"'
  Pop $0
  Pop $1
  nsExec::ExecToStack 'netsh advfirewall firewall delete rule name="ByTune Remote Host"'
  Pop $0
  Pop $1
  nsExec::ExecToStack 'netsh advfirewall firewall add rule name="FTune" dir=in action=allow program="$appExe" enable=yes profile=any'
  Pop $0
  Pop $1
  nsExec::ExecToStack 'netsh advfirewall firewall add rule name="FTune Remote Host" dir=in action=allow protocol=TCP localport=8765 enable=yes profile=any'
  Pop $0
  Pop $1
  ; Let Explorer pick the new "Open with" entries up now.
  System::Call "shell32::SHChangeNotify(i 0x08000000, i 0x1000, p 0, p 0)"
!macroend

!macro customUnInstall
  !insertmacro FTuneEachAudioExtension FTuneWithdrawFrom
  DeleteRegKey SHELL_CONTEXT "Software\Classes\FTune.Audio"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\ByTune.Audio"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
  nsExec::ExecToStack 'netsh advfirewall firewall delete rule name="FTune"'
  Pop $0
  Pop $1
  nsExec::ExecToStack 'netsh advfirewall firewall delete rule name="FTune Remote Host"'
  Pop $0
  Pop $1
  System::Call "shell32::SHChangeNotify(i 0x08000000, i 0x1000, p 0, p 0)"
!macroend
