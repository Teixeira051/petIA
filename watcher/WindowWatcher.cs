using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

class WindowWatcher
{
    delegate void WinEventDelegate(IntPtr hWinEventHook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint dwEventThread, uint dwmsEventTime);

    [DllImport("user32.dll")]
    static extern IntPtr SetWinEventHook(uint eventMin, uint eventMax, IntPtr hmodWinEventProc, WinEventDelegate lpfnWinEventProc, uint idProcess, uint idThread, uint dwFlags);

    [DllImport("user32.dll")]
    static extern bool UnhookWinEvent(IntPtr hWinEventHook);

    const uint EVENT_SYSTEM_MOVESIZESTART = 0x000A;
    const uint EVENT_SYSTEM_MOVESIZEEND = 0x000B;
    const uint WINEVENT_OUTOFCONTEXT = 0;

    static WinEventDelegate procDelegate;

    static void WinEventProc(IntPtr hWinEventHook, uint eventType, IntPtr hwnd, int idObject, int idChild, uint dwEventThread, uint dwmsEventTime)
    {
        if (idObject != 0) return;
        if (eventType == EVENT_SYSTEM_MOVESIZESTART)
        {
            Console.WriteLine("WINDOW_MOVE_START");
            Console.Out.Flush();
        }
        else if (eventType == EVENT_SYSTEM_MOVESIZEEND)
        {
            Console.WriteLine("WINDOW_MOVE_END");
            Console.Out.Flush();
        }
    }

    [STAThread]
    static void Main()
    {
        procDelegate = new WinEventDelegate(WinEventProc);
        IntPtr hook = SetWinEventHook(EVENT_SYSTEM_MOVESIZESTART, EVENT_SYSTEM_MOVESIZEEND, IntPtr.Zero, procDelegate, 0, 0, WINEVENT_OUTOFCONTEXT);
        if (hook == IntPtr.Zero)
        {
            Console.WriteLine("HOOK_FAILED");
            return;
        }
        Console.WriteLine("HOOK_READY");
        Console.Out.Flush();

        Application.Run();

        UnhookWinEvent(hook);
    }
}
