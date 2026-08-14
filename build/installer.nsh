!macro customInit
  dsh_preflight_check:
    ClearErrors
    nsExec::ExecToStack '"$SYSDIR\cmd.exe" /d /s /c "dsh --version"'
    Pop $0
    Pop $1

    StrCmp $0 "0" dsh_preflight_ready

    ${If} ${Silent}
      Abort
    ${EndIf}

    MessageBox MB_ABORTRETRYIGNORE|MB_ICONEXCLAMATION \
      "未检测到可运行的 DeepSeek Harness。$\r$\n$\r$\nDSH Desktop 需要本机 Node.js 和 DSH，并要求在新的 PowerShell 中执行 dsh --version 成功。请先安装或修复 DSH，再继续安装桌面端。$\r$\n$\r$\n中止：退出安装$\r$\n重试：重新检测$\r$\n忽略：仍然继续（仅在确认 DSH 已可用时）$\r$\n$\r$\nA working local DSH installation is required." \
      IDABORT dsh_preflight_abort \
      IDRETRY dsh_preflight_check
    Goto dsh_preflight_ready

  dsh_preflight_abort:
    Abort

  dsh_preflight_ready:
!macroend
