import { useEffect, useState } from "react";
import { Smartphone, Copy, Check, Wifi, X } from "lucide-react";

export function RemoteConnectButton() {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<{ ip: string; port: number } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open && !info) {
      (window.ftune ?? window.bytune)?.getRemoteInfo().then((res) => {
        if (res) setInfo(res);
      });
    }
  }, [open, info]);

  const handleCopy = () => {
    if (!info) return;
    navigator.clipboard.writeText(`${info.ip}:${info.port}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        title="Mobile App Controller"
        aria-label="Mobile App Controller"
        className={`w-10 h-10 rounded-full grid place-items-center transition-colors select-none ${
          open ? "bg-ink-hi/[0.18] text-white" : "bg-ink-hi/[0.08] hover:bg-ink-hi/[0.16] text-ink-hi/[0.8]"
        }`}
      >
        <Smartphone className="w-5 h-5" />
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 p-4 rounded-xl bg-[#121217] border border-[#2b2b36] shadow-2xl text-left">
          <div className="flex items-center justify-between pb-3 border-b border-[#2b2b36]">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-sky-400" />
              <span className="text-sm font-bold text-white">Mobile Controller</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-neutral-400 hover:text-white p-1 rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="my-3 space-y-2">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>Status</span>
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Listening
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-[#1a1a22] border border-[#262633]">
              <div className="text-[11px] font-semibold text-neutral-400 mb-1">PC Network Address</div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-sky-300 font-semibold select-all">
                  {info ? `${info.ip}:${info.port}` : "Loading..."}
                </span>
                <button
                  onClick={handleCopy}
                  disabled={!info}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 transition-colors"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>

            <p className="text-[12px] text-neutral-400 leading-relaxed mt-2">
              Connect your phone to the same Wi-Fi, open the <strong>FTune Mobile</strong> app, and it will automatically link to this PC.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

