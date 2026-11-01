import { useState } from "react";
import { motion } from "framer-motion";
import { X, LogIn, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

interface AuthModalProps {
  onClose: () => void;
}

export function AuthModal({ onClose }: AuthModalProps) {
  const { login, register } = useAuth();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password.trim()) { setError("Fill in all fields."); return; }
    setLoading(true);
    try {
      if (tab === "login") await login(username.trim(), password);
      else await register(username.trim(), password);
      onClose();
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-background/90 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.85, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        className="w-full max-w-sm bg-background neon-box-pink pixel-frame overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-primary/30 bg-primary/5">
          <h2 className="font-arcade text-sm text-primary tracking-widest">PLAYER ACCOUNT</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-primary/20">
          {(["login", "register"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(""); }}
              className={`flex-1 py-3 font-arcade text-[9px] tracking-widest transition-colors ${
                tab === t ? "text-primary bg-primary/10 border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`tab-${t}`}
            >
              {t === "login" ? "LOG IN" : "CREATE"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <label className="font-arcade text-[8px] text-muted-foreground block mb-2 tracking-widest">USERNAME</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toUpperCase())}
              maxLength={16}
              placeholder="MAX 16 CHARS"
              data-testid="input-username"
              autoFocus
              className="w-full bg-input border-2 border-ring text-foreground font-arcade p-3 text-sm uppercase focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <div>
            <label className="font-arcade text-[8px] text-muted-foreground block mb-2 tracking-widest">PASSWORD</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="MIN 3 CHARS"
              data-testid="input-password"
              className="w-full bg-input border-2 border-ring text-foreground font-tech p-3 text-sm focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {error && (
            <div className="px-3 py-2 bg-destructive/10 border border-destructive/40">
              <p className="font-tech text-xs text-destructive">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            data-testid="button-auth-submit"
            className="w-full py-3 bg-primary text-primary-foreground font-arcade text-sm flex items-center justify-center gap-2 hover:bg-primary/80 disabled:opacity-50 transition-colors arcade-shadow-active"
          >
            {loading ? "PROCESSING..." : tab === "login"
              ? <><LogIn className="w-4 h-4" /> LOG IN</>
              : <><UserPlus className="w-4 h-4" /> CREATE ACCOUNT</>
            }
          </button>

          <button type="button" onClick={() => { setTab(t => t === "login" ? "register" : "login"); setError(""); }}
            className="w-full font-tech text-xs text-muted-foreground/60 hover:text-secondary transition-colors py-1">
            {tab === "login" ? "No account? → CREATE ONE" : "Have an account? → LOG IN"}
          </button>
        </form>

        <div className="px-6 pb-4">
          <p className="font-tech text-[10px] text-muted-foreground/40 text-center">Account needed to save scores &amp; earn CUDA coins</p>
        </div>
      </motion.div>
    </motion.div>
  );
}
