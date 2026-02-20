using System;
using System.Runtime.InteropServices;

class Program {
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] static extern bool AllowSetForegroundWindow(int pid);
    [DllImport("kernel32.dll")] static extern IntPtr GetConsoleWindow();
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("shcore.dll")] static extern int SetProcessDpiAwareness(int value);

    [ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")] class FOS_RCW {}

    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItem {
        void BindToHandler(); void GetParent();
        [PreserveSig] int GetDisplayName(uint n, [MarshalAs(UnmanagedType.LPWStr)] out string s);
        void GetAttributes(); void Compare();
    }

    [ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IFileOpenDialog {
        [PreserveSig] int Show(IntPtr hwnd);
        void SetFileTypes(); void SetFileTypeIndex(); void GetFileTypeIndex();
        void Advise(); void Unadvise();
        void SetOptions(uint fos); void GetOptions(out uint fos);
        void SetDefaultFolder(IShellItem psi); void SetFolder(IShellItem psi);
        void GetFolder(out IShellItem ppsi); void GetCurrentSelection(out IShellItem ppsi);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string n); void GetFileName();
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string t);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string t); void SetFileNameLabel();
        void GetResult(out IShellItem ppsi);
        void AddPlace(); void SetDefaultExtension(); void Close();
        void SetClientGuid(); void ClearClientData(); void SetFilter();
        void GetResults(); void GetSelectedItems();
    }

    [STAThread]
    static int Main() {
        // System DPI aware — crisp rendering without oversizing
        try { SetProcessDpiAwareness(1); } catch {}
        AllowSetForegroundWindow(-1);
        // Grab the foreground window (browser) BEFORE hiding the console
        IntPtr owner = GetForegroundWindow();
        // Hide any console window
        IntPtr console = GetConsoleWindow();
        if (console != IntPtr.Zero) ShowWindow(console, 0);

        var dlg = (IFileOpenDialog)new FOS_RCW();
        dlg.SetTitle("Select workspace folder");
        dlg.SetOptions(0x20); // FOS_PICKFOLDERS
        // Pass the browser window as owner so the dialog appears on top of it
        if (dlg.Show(owner) != 0) return 1;
        IShellItem item; dlg.GetResult(out item);
        string p; item.GetDisplayName(0x80058000, out p);
        // Write raw UTF-8 bytes to stdout (Console.Write uses OEM codepage,
        // and Console.OutputEncoding crashes on -target:winexe with no console)
        var bytes = System.Text.Encoding.UTF8.GetBytes(p);
        using (var stdout = Console.OpenStandardOutput())
            stdout.Write(bytes, 0, bytes.Length);
        return 0;
    }
}
