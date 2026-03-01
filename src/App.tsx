import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { User, ClassMember, Report, Schedule } from './types';
import {
  LogIn, LayoutDashboard, ClipboardList, Users, LogOut, MapPin,
  Camera, CheckCircle2, AlertCircle, Clock, ChevronRight,
  UserPlus, Trash2, RotateCcw, X, Search, Plus,
  Edit2, ChevronDown, Calendar, ShieldCheck, RefreshCw, ArrowRight, Settings,
  CheckCircle, AlertTriangle, Info, Eye, EyeOff, Copy, FolderOpen, Folder,
  History, Image as ImageIcon, Maximize2, Key, FlaskConical
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SCHOOL_LAT, SCHOOL_LON, MAX_DISTANCE_METERS, getDistance, getCurrentWIBTime, getStatus } from './constants';
import confetti from 'canvas-confetti';

// --- CONSTANTS ---
const MEMBER_STATUSES = {
  HADIR: 'Hadir', IZIN: 'Izin', SAKIT: 'Sakit',
  TIDAK_MASUK: 'Tidak Masuk', IZIN_TELAT: 'Izin Telat', TIDAK_PIKET: 'Tidak Piket'
} as const;
type MemberStatus = typeof MEMBER_STATUSES[keyof typeof MEMBER_STATUSES];
const DAYS_ORDER = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
const ALL_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// --- UTILS ---
const safeFetch = async (url: string, options?: RequestInit) => {
  const res = await fetch(url, options);
  const contentType = res.headers.get("content-type");
  if (!res.ok) {
    if (contentType?.includes("application/json")) {
      const err = await res.json();
      throw new Error(err.message || `HTTP error! status: ${res.status}`);
    }
    throw new Error(`HTTP error! status: ${res.status}`);
  }
  if (!contentType?.includes("application/json")) throw new Error("Server returned non-JSON response.");
  return res.json();
};

const getTodayStr = () => new Date().toISOString().split('T')[0];

// --- IMAGE PREVIEW MODAL ---
const ImagePreviewModal = ({ src, onClose }: { src: string; onClose: () => void }) => (
  <AnimatePresence>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <button onClick={onClose} className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-all z-10">
        <X size={20} />
      </button>
      <motion.img
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        src={src}
        alt="Preview"
        className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </motion.div>
  </AnimatePresence>
);

// --- CUSTOM DROPDOWN ---
const CustomDropdown = ({ options, value, onChange, placeholder = "Pilih...", className = "", disabled = false }: {
  options: { id: string | number; label: string }[];
  value: string | number;
  onChange: (id: any) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find(o => o.id.toString() === value?.toString());
  return (
    <div className={`relative ${className}`}>
      <button type="button" disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-700 hover:border-slate-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${isOpen ? 'ring-2 ring-emerald-500/20 border-emerald-500 bg-white' : ''}`}
      >
        <span className={selected ? 'text-slate-900 font-semibold' : 'text-slate-400'}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 z-40 max-h-60 overflow-y-auto py-2"
            >
              {options.map(opt => (
                <button key={opt.id} type="button"
                  onClick={() => { onChange(opt.id); setIsOpen(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${opt.id.toString() === value?.toString() ? 'bg-emerald-50 text-emerald-600 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
                >{opt.label}</button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- CONFIRM DIALOG ---
const ConfirmDialog = ({ isOpen, onClose, onConfirm, title, message, confirmText = "Ya, Lanjutkan", requireText = false, expectedText = "KONFIRMASI" }: {
  isOpen: boolean; onClose: () => void; onConfirm: () => void;
  title: string; message: string; confirmText?: string; requireText?: boolean; expectedText?: string;
}) => {
  const [inputText, setInputText] = useState('');
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl border border-slate-100">
        <div className="flex justify-between items-start mb-6">
          <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"><X size={20} /></button>
        </div>
        <p className="text-slate-600 mb-8 leading-relaxed font-medium">{message}</p>
        {requireText && (
          <div className="mb-8">
            <label className="block text-xs font-bold text-slate-400 uppercase mb-3 tracking-widest">Ketik "{expectedText}" untuk konfirmasi</label>
            <input type="text" className="w-full px-5 py-4 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-red-500/10 focus:border-red-500 outline-none transition-all font-mono text-sm bg-slate-50" placeholder={expectedText} value={inputText} onChange={(e) => setInputText(e.target.value)} />
          </div>
        )}
        <div className="flex gap-4">
          <button onClick={onClose} className="flex-1 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all active:scale-[0.98]">Batal</button>
          <button onClick={() => { if (requireText && inputText !== expectedText) return; onConfirm(); onClose(); setInputText(''); }}
            disabled={requireText && inputText !== expectedText}
            className="flex-1 py-4 bg-red-600 text-white font-bold rounded-2xl hover:bg-red-700 transition-all shadow-lg shadow-red-200 active:scale-[0.98] disabled:opacity-50"
          >{confirmText}</button>
        </div>
      </motion.div>
    </div>
  );
};

// --- SETUP PAGE ---
const SetupPage = ({ onSetup }: { onSetup: (code: string) => void }) => {
  const [loading, setLoading] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const data = await safeFetch('/api/setup-admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      if (data.success) setGeneratedCode(data.code);
    } catch (err: any) {
      alert(err.message || 'Gagal membuat akun admin');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-emerald-100 rounded-full blur-3xl opacity-50" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-blue-100 rounded-full blur-3xl opacity-50" />
      </div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md relative">
        <div className="glass-card p-10">
          <div className="text-center mb-10">
            <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="w-20 h-20 bg-emerald-600 text-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-emerald-200">
              <Key size={40} />
            </motion.div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Setup Awal</h1>
            <p className="text-slate-500 mt-2 font-medium">Generate kode akun admin untuk memulai</p>
          </div>
          {!generatedCode ? (
            <div className="space-y-6">
              <div className="p-6 bg-amber-50 border border-amber-200 rounded-3xl">
                <p className="text-amber-800 font-semibold text-sm text-center">⚠️ Belum ada akun admin. Klik tombol di bawah untuk membuat kode akses admin pertama.</p>
              </div>
              <button onClick={handleGenerate} disabled={loading} className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl transition-all shadow-xl shadow-slate-200 disabled:opacity-50 flex items-center justify-center gap-3 group">
                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Key size={18} />Generate Kode Admin</>}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-3xl text-center space-y-4">
                <p className="text-emerald-700 font-bold text-sm uppercase tracking-widest">Kode Akun Admin Anda</p>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-3xl font-mono font-bold text-slate-900 tracking-[0.3em]">{generatedCode}</span>
                  <button onClick={handleCopy} className="p-2 bg-white rounded-xl border border-emerald-200 hover:bg-emerald-50 transition-all text-emerald-600">
                    {copied ? <CheckCircle size={18} /> : <Copy size={18} />}
                  </button>
                </div>
                <p className="text-emerald-600 text-xs font-medium">Simpan kode ini dengan aman. Anda akan membutuhkannya untuk login.</p>
              </div>
              <button onClick={() => onSetup(generatedCode)} className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all shadow-xl shadow-emerald-200 flex items-center justify-center gap-3">
                Lanjut ke Login <ArrowRight size={18} />
              </button>
            </div>
          )}
        </div>
        <p className="text-center mt-8 text-slate-400 text-sm font-medium">&copy; 2025 Sistem Piket Kelas X TKJT 1</p>
      </motion.div>
    </div>
  );
};

// --- LOGIN PAGE ---
const LoginPage = ({ onLogin }: { onLogin: (user: User) => void }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCode, setShowCode] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const data = await safeFetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_code: code.toUpperCase().trim() }),
      });
      if (data.success) onLogin(data.user);
      else setError(data.message);
    } catch (err: any) {
      setError(err.message || 'Gagal menghubungkan ke server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-emerald-100 rounded-full blur-3xl opacity-50" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-blue-100 rounded-full blur-3xl opacity-50" />
      </div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md relative">
        <div className="glass-card p-10">
          <div className="text-center mb-10">
            <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="w-20 h-20 bg-emerald-600 text-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-emerald-200">
              <ShieldCheck size={40} />
            </motion.div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Sistem Piket</h1>
            <p className="text-slate-500 mt-2 font-medium">Masukkan kode akun Anda</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Kode Akun</label>
              <div className="relative">
                <input
                  type={showCode ? 'text' : 'password'}
                  required
                  className="input-field pl-11 pr-11 font-mono tracking-widest uppercase"
                  placeholder="••••••"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <button type="button" onClick={() => setShowCode(!showCode)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                  {showCode ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            {error && (
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                className="p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-semibold flex items-center gap-3 border border-red-100">
                <AlertCircle size={18} />{error}
              </motion.div>
            )}
            <button type="submit" disabled={loading}
              className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl transition-all shadow-xl shadow-slate-200 disabled:opacity-50 flex items-center justify-center gap-3 group">
              {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Masuk Sekarang<ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></>}
            </button>
          </form>
        </div>
        <p className="text-center mt-8 text-slate-400 text-sm font-medium">&copy; 2025 Sistem Piket Kelas X TKJT 1</p>
      </motion.div>
    </div>
  );
};

// --- TESTING PAGE ---
const TestingPage = () => {
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<any>(null);
  const [testPjId, setTestPjId] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [cleaningPhoto, setCleaningPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [members, setMembers] = useState<ClassMember[]>([]);
  const [memberStatuses, setMemberStatuses] = useState<Record<number, MemberStatus>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedAbsentSchool, setSelectedAbsentSchool] = useState<ClassMember[]>([]);

  useEffect(() => {
    const fetchAll = async () => {
      const [s, u, m] = await Promise.all([safeFetch('/api/settings'), safeFetch('/api/users'), safeFetch('/api/members')]);
      setSettings(s); setUsers(u.filter((u: User) => u.role === 'pj')); setMembers(m);
      setLoading(false);
    };
    fetchAll().catch(console.error);
  }, []);

  const fetchStatus = async (pjId: string) => {
    if (!pjId) return;
    const data = await safeFetch(`/api/status/${pjId}`);
    setStatus(data);
  };

  const pjMembers = testPjId ? members.filter(m => m.pj_id === parseInt(testPjId)) : [];

  const onSelectPj = (v: string) => {
    setTestPjId(v.toString());
    fetchStatus(v.toString());
    // Reset member statuses for new PJ's members
    const initial: Record<number, MemberStatus> = {};
    members.filter(m => m.pj_id === parseInt(v)).forEach(m => { initial[m.id] = MEMBER_STATUSES.HADIR; });
    setMemberStatuses(initial);
    setSelectedAbsentSchool([]);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  if (settings.testing_mode !== 'true') {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto mb-6"><FlaskConical size={40} className="text-slate-400" /></div>
        <h2 className="text-2xl font-bold text-slate-900 mb-3">Mode Testing Tidak Aktif</h2>
        <p className="text-slate-500 font-medium">Aktifkan Test Mode di panel admin → Pengaturan untuk menggunakan halaman ini.</p>
      </div>
    );
  }

  const handleTestAttendance = async () => {
    if (!testPjId || !photo) return;
    setSubmitting(true);
    const formData = new FormData();
    formData.append('pj_id', testPjId);
    formData.append('photo', photo);
    // Bypass: gunakan koordinat sekolah (geofencing bypass)
    formData.append('latitude', SCHOOL_LAT.toString());
    formData.append('longitude', SCHOOL_LON.toString());
    // Bypass: status selalu Tepat Waktu (timestamp bypass)
    formData.append('time', '06:00');
    formData.append('status', 'Tepat Waktu');
    try {
      await safeFetch('/api/attendance', { method: 'POST', body: formData });
      await fetchStatus(testPjId);
      confetti();
    } catch (err: any) { alert(err.message); }
    finally { setSubmitting(false); }
  };

  const handleTestReport = async () => {
    if (!testPjId || !cleaningPhoto) return;
    setSubmitting(true);
    // Build absent list from member statuses
    const absentPjMembers = pjMembers.filter(m => memberStatuses[m.id] !== MEMBER_STATUSES.HADIR)
      .map(m => ({ member_id: m.id, name: m.name, reason: memberStatuses[m.id] || MEMBER_STATUSES.TIDAK_MASUK }));
    const absentSchool = selectedAbsentSchool.map(m => ({ member_id: m.id, name: m.name, reason: MEMBER_STATUSES.TIDAK_MASUK }));
    const allAbsent = [...absentPjMembers, ...absentSchool];
    const desc = allAbsent.length > 0 ? allAbsent.map(m => `${m.name} - ${m.reason}`).join('\n') : 'Semua anggota hadir';

    const formData = new FormData();
    formData.append('pj_id', testPjId);
    formData.append('photo', cleaningPhoto);
    formData.append('description', desc);
    formData.append('absentMembers', JSON.stringify(allAbsent));
    try {
      await safeFetch('/api/report', { method: 'POST', body: formData });
      await fetchStatus(testPjId);
      confetti();
    } catch (err: any) { alert(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-8">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center"><FlaskConical size={24} /></div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Halaman Simulasi Testing</h2>
          <p className="text-sm text-blue-600 font-bold">Mode testing aktif - Lokasi, Timestamp &amp; Jadwal diabaikan</p>
        </div>
      </div>

      {/* PJ selector */}
      <div className="bento-card p-6 space-y-4 bg-white">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pilih PJ untuk Simulasi</label>
        <CustomDropdown
          options={[{ id: '', label: 'Pilih PJ...' }, ...users.map(u => ({ id: u.id, label: `${u.name} (${u.group_name})` }))]}
          value={testPjId}
          onChange={(v) => onSelectPj(v.toString())}
        />
        {status && (
          <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 text-sm flex gap-4 flex-wrap">
            <div><span className="font-bold text-blue-700">Checkin:</span> <span className="text-blue-600">{status.checkin_time || '—'}</span></div>
            <div><span className="font-bold text-blue-700">Laporan:</span> <span className="text-blue-600">{status.cleaning_photo ? '✓ Terkirim' : '✗ Belum'}</span></div>
            <div><span className="font-bold text-blue-700">Status:</span> <span className="text-blue-600">{status.status || '—'}</span></div>
          </div>
        )}
      </div>

      {testPjId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Absensi Simulasi */}
          <div className="bento-card p-6 bg-white space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center"><MapPin size={18} /></div>
              <h3 className="font-bold text-slate-900">Simulasi Absensi Kehadiran</h3>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-[10px] font-bold text-blue-600 uppercase tracking-widest flex gap-2">
              <Info size={12} className="flex-shrink-0 mt-0.5" />Bypass: Lokasi otomatis diisi koordinat sekolah · Waktu diset 06:00 (Tepat Waktu)
            </div>
            <label className="flex flex-col items-center p-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 cursor-pointer hover:border-blue-400 transition-all">
              <Camera size={24} className="text-slate-400 mb-2" />
              <span className="text-xs font-medium text-slate-500">{photo ? photo.name : 'Pilih foto kehadiran'}</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
            </label>
            {photo && (
              <div className="rounded-xl overflow-hidden aspect-video bg-slate-100">
                <img src={URL.createObjectURL(photo)} alt="Preview" className="w-full h-full object-cover" />
              </div>
            )}
            <button onClick={handleTestAttendance} disabled={!photo || submitting || !!status?.checkin_time}
              className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 text-sm">
              {status?.checkin_time ? '✓ Sudah Absen' : submitting ? 'Mengirim...' : 'Kirim Absensi Simulasi'}
            </button>
          </div>

          {/* Laporan Simulasi */}
          <div className="bento-card p-6 bg-white space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center"><ClipboardList size={18} /></div>
              <h3 className="font-bold text-slate-900">Simulasi Laporan Kebersihan</h3>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-[10px] font-bold text-amber-600 uppercase tracking-widest flex gap-2">
              <Info size={12} className="flex-shrink-0 mt-0.5" />Bypass: Jadwal tidak dicek · Status anggota bisa diatur
            </div>
            <label className="flex flex-col items-center p-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 cursor-pointer hover:border-amber-400 transition-all">
              <Camera size={24} className="text-slate-400 mb-2" />
              <span className="text-xs font-medium text-slate-500">{cleaningPhoto ? cleaningPhoto.name : 'Pilih foto kebersihan'}</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setCleaningPhoto(e.target.files?.[0] || null)} />
            </label>
            {cleaningPhoto && (
              <div className="rounded-xl overflow-hidden aspect-video bg-slate-100">
                <img src={URL.createObjectURL(cleaningPhoto)} alt="Preview" className="w-full h-full object-cover" />
              </div>
            )}

            {/* Member status management */}
            {pjMembers.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Users size={12} />Status Anggota Piket</p>
                <div className="space-y-2">
                  {pjMembers.map(m => (
                    <div key={m.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-sm font-bold text-slate-800 flex-1">{m.name}</span>
                      <CustomDropdown
                        className="w-40"
                        options={[MEMBER_STATUSES.HADIR, MEMBER_STATUSES.SAKIT, MEMBER_STATUSES.IZIN, MEMBER_STATUSES.TIDAK_MASUK, MEMBER_STATUSES.IZIN_TELAT, MEMBER_STATUSES.TIDAK_PIKET].map(s => ({ id: s, label: s }))}
                        value={memberStatuses[m.id] || MEMBER_STATUSES.HADIR}
                        onChange={(val) => setMemberStatuses(prev => ({ ...prev, [m.id]: val as MemberStatus }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Absent school members */}
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><AlertCircle size={12} />Anggota Kelas Tidak Masuk</p>
              <div className="relative">
                <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-400">
                  <Search size={16} className="text-slate-400" />
                  <input type="text" placeholder="Cari nama..." className="flex-1 bg-transparent outline-none text-sm font-medium"
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setShowSuggestions(true); }}
                    onFocus={() => setShowSuggestions(true)} />
                </div>
                <AnimatePresence>
                  {showSuggestions && searchTerm.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                      className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-100 z-30 max-h-40 overflow-y-auto py-1">
                      {members.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()))
                        .filter(m => !selectedAbsentSchool.find(s => s.id === m.id))
                        .filter(m => !pjMembers.find(p => p.id === m.id))
                        .filter(m => !m.is_pj_group)
                        .map(m => (
                          <button key={m.id} onClick={() => { setSelectedAbsentSchool(prev => [...prev, m]); setSearchTerm(''); setShowSuggestions(false); }}
                            className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">{m.name}</button>
                        ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedAbsentSchool.map(m => (
                  <div key={m.id} className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 text-red-700 rounded-lg border border-red-100">
                    <span className="text-xs font-bold">{m.name}</span>
                    <button onClick={() => setSelectedAbsentSchool(prev => prev.filter(s => s.id !== m.id))} className="hover:bg-red-100 rounded-full"><X size={10} /></button>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={handleTestReport} disabled={!cleaningPhoto || submitting || !status?.checkin_time || !!status?.cleaning_photo}
              className="w-full py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 transition-all disabled:opacity-50 text-sm">
              {status?.cleaning_photo ? '✓ Laporan Terkirim' : !status?.checkin_time ? '⚠ Absen dulu sebelum lapor' : submitting ? 'Mengirim...' : 'Kirim Laporan Simulasi'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- PJ DASHBOARD ---
const PJDashboard = ({ user }: { user: User }) => {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [cleaningPhoto, setCleaningPhoto] = useState<File | null>(null);
  const [allMembers, setAllMembers] = useState<ClassMember[]>([]);
  const [memberStatuses, setMemberStatuses] = useState<Record<number, { status: MemberStatus; reason?: string }>>({});
  const [submitting, setSubmitting] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [nextDuty, setNextDuty] = useState<Schedule | null>(null);
  const [settings, setSettings] = useState<any>({});
  const [isAssignedToday, setIsAssignedToday] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedAbsentSchool, setSelectedAbsentSchool] = useState<ClassMember[]>([]);
  const [activeView, setActiveView] = useState<'dashboard' | 'history' | 'schedule'>('dashboard');
  const [history, setHistory] = useState<Report[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [editPhoto, setEditPhoto] = useState<File | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const isPastTimeLimit = useMemo(() => {
    if (settings.testing_mode === 'true') return false;
    if (!settings.report_time_limit) return false;
    const [limitH, limitM] = settings.report_time_limit.split(':').map(Number);
    const now = new Date();
    return now.getHours() > limitH || (now.getHours() === limitH && now.getMinutes() > limitM);
  }, [settings]);

  const canEditReport = useCallback((report: Report) => {
    if (settings.testing_mode === 'true') return true;
    if (!report.submitted_at) return false;
    const limitMin = parseInt(settings.edit_time_limit_minutes || '15');
    const submittedAt = new Date((report.submitted_at.includes('Z') ? report.submitted_at : report.submitted_at + 'Z'));
    return (Date.now() - submittedAt.getTime()) / 60000 <= limitMin;
  }, [settings]);

  useEffect(() => {
    fetchStatus();
    fetchMembers();
    fetchSettings();
    navigator.geolocation.getCurrentPosition((pos) => {
      setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      setDistance(getDistance(pos.coords.latitude, pos.coords.longitude, SCHOOL_LAT, SCHOOL_LON));
    }, (err) => console.error("Geolocation error:", err));
  }, [user.id]);

  const fetchStatus = async () => {
    try {
      const data = await safeFetch(`/api/status/${user.id}`);
      setStatus(data);
    } catch { } finally { setLoading(false); }
  };

  const fetchSettings = async () => {
    try { setSettings(await safeFetch('/api/settings')); } catch { }
  };

  const fetchHistory = async () => {
    try { setHistory(await safeFetch(`/api/reports/history/${user.id}`)); } catch { }
  };

  const fetchMembers = async () => {
    try {
      const data = await safeFetch('/api/members');
      setAllMembers(data);
      const initial: Record<number, any> = {};
      data.filter((m: any) => m.pj_id === user.id).forEach((m: any) => { initial[m.id] = { status: MEMBER_STATUSES.HADIR }; });
      setMemberStatuses(initial);
      const schedData: Schedule[] = await safeFetch('/api/schedules');
      setSchedules(schedData);
      if (user.group_name) {
        const today = ALL_DAYS[new Date().getDay()];
        setIsAssignedToday(schedData.some(s => s.group_name === user.group_name && s.day === today));
        const tomorrowDay = ALL_DAYS[(new Date().getDay() + 1) % 7];
        const duty = schedData.find(s => s.group_name === user.group_name && s.day === tomorrowDay);
        if (duty) setNextDuty(duty);
      }
    } catch (err) { console.error(err); }
  };

  const handleAttendance = async () => {
    if (!photo) return;
    if (settings.testing_mode !== 'true' && distance! > MAX_DISTANCE_METERS) {
      alert(`Jarak Anda terlalu jauh (${Math.round(distance!)}m). Maksimal ${MAX_DISTANCE_METERS}m dari sekolah.`);
      return;
    }
    setSubmitting(true);
    const time = getCurrentWIBTime();
    const formData = new FormData();
    formData.append('pj_id', user.id.toString());
    formData.append('photo', photo);
    formData.append('latitude', (location?.lat || SCHOOL_LAT).toString());
    formData.append('longitude', (location?.lon || SCHOOL_LON).toString());
    formData.append('time', time);
    formData.append('status', getStatus(time));
    try {
      const data = await safeFetch('/api/attendance', { method: 'POST', body: formData });
      if (data.success) { confetti(); fetchStatus(); }
      else alert(data.message);
    } catch (err: any) { alert(err.message || 'Gagal mengirim absensi'); }
    finally { setSubmitting(false); }
  };

  const handleReport = async () => {
    if (!cleaningPhoto) return;
    setSubmitting(true);
    const absentList: any[] = selectedAbsentSchool.map(m => ({ member_id: m.id, name: m.name, reason: MEMBER_STATUSES.TIDAK_MASUK }));
    const pjMembers = allMembers.filter(m => m.pj_id === user.id);
    const absentPjMembers = pjMembers.filter(m => memberStatuses[m.id]?.status !== MEMBER_STATUSES.HADIR)
      .map(m => ({ member_id: m.id, name: m.name, reason: memberStatuses[m.id]?.status }));

    // Build simple description - only absent members
    const allAbsent = [...absentPjMembers, ...absentList];
    let desc = '';
    if (allAbsent.length > 0) {
      desc = allAbsent.map(m => `${m.name} - ${m.reason}`).join('\n');
    } else {
      desc = 'Semua anggota hadir';
    }

    const formData = new FormData();
    formData.append('pj_id', user.id.toString());
    formData.append('photo', cleaningPhoto);
    formData.append('description', desc);
    formData.append('absentMembers', JSON.stringify([...absentPjMembers, ...absentList]));
    try {
      const data = await safeFetch('/api/report', { method: 'POST', body: formData });
      if (data.success) { confetti(); fetchStatus(); setSelectedAbsentSchool([]); setSearchTerm(''); }
      else alert(data.message);
    } catch (err: any) { alert(err.message || 'Gagal mengirim laporan'); }
    finally { setSubmitting(false); }
  };

  const handleEditPhoto = async () => {
    if (!editPhoto || !editingReport) return;
    setEditSubmitting(true);
    const formData = new FormData();
    formData.append('photo', editPhoto);
    try {
      await safeFetch(`/api/report/${editingReport.id}/edit-photo`, { method: 'POST', body: formData });
      await fetchHistory();
      setEditingReport(null);
      setEditPhoto(null);
    } catch (err: any) { alert(err.message); }
    finally { setEditSubmitting(false); }
  };

  const updateMemberStatus = (id: number, status: MemberStatus) => setMemberStatuses(prev => ({ ...prev, [id]: { status } }));
  const removeSelectedAbsent = (id: number) => setSelectedAbsentSchool(prev => prev.filter(m => m.id !== id));

  if (loading) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-slate-500 font-medium">Memuat Dashboard...</p>
    </div>
  );

  const pjMembers = allMembers.filter(m => m.pj_id === user.id);

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {previewImage && <ImagePreviewModal src={previewImage} onClose={() => setPreviewImage(null)} />}

      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Halo, {user.name} 👋</h2>
          <p className="text-slate-500 font-medium mt-1 text-sm sm:text-base">Selamat bertugas sebagai PJ Piket hari ini.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="glass-card px-4 py-2.5 flex items-center gap-3">
            <div className="text-right">
              <p className="text-lg font-mono font-bold text-emerald-600 tracking-tighter">{getCurrentWIBTime()}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">WIB</p>
            </div>
            <div className="w-px h-7 bg-slate-200" />
            {/* Schedule full page button */}
            <button onClick={() => setActiveView(activeView === 'schedule' ? 'dashboard' : 'schedule')}
              title="Jadwal Piket Hari Ini"
              className={`w-10 h-10 rounded-xl flex items-center justify-center hover:bg-slate-800 transition-all shadow-md ${activeView === 'schedule' ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'}`}>
              <LayoutDashboard size={18} />
            </button>
          </div>
          {/* History tab button */}
          <button onClick={() => { setActiveView(activeView === 'history' ? 'dashboard' : 'history'); if (activeView !== 'history') fetchHistory(); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all ${activeView === 'history' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'}`}>
            <History size={16} />
            <span className="hidden sm:inline">Riwayat</span>
          </button>
        </div>
      </header>


      {/* Alerts */}
      <div className="space-y-3">
        {!isAssignedToday && (
          <div className="p-5 bg-amber-50 border border-amber-200 rounded-[2rem] flex items-center gap-4 text-amber-800">
            <div className="w-10 h-10 bg-amber-100 rounded-2xl flex items-center justify-center shrink-0"><AlertTriangle size={20} /></div>
            <div><p className="font-bold">Bukan Jadwal Anda</p><p className="text-sm font-medium opacity-80">Hari ini Anda tidak memiliki jadwal piket.</p></div>
          </div>
        )}
        {isPastTimeLimit && !status && (
          <div className="p-5 bg-red-50 border border-red-200 rounded-[2rem] flex items-center gap-4 text-red-800">
            <div className="w-10 h-10 bg-red-100 rounded-2xl flex items-center justify-center shrink-0"><Clock size={20} /></div>
            <div><p className="font-bold">Batas Waktu Terlewati</p><p className="text-sm font-medium opacity-80">Batas absen ({settings.report_time_limit} WIB) telah berakhir.</p></div>
          </div>
        )}
        {settings.testing_mode === 'true' && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-center gap-3 text-blue-700">
            <Info size={16} /><p className="text-xs font-bold uppercase tracking-widest">Mode Testing Aktif: Batasan waktu & lokasi diabaikan.</p>
          </div>
        )}
      </div>

      {/* View: Schedule Full Page */}
      <AnimatePresence mode="wait">
        {activeView === 'schedule' && (
          <motion.div key="schedule" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className="bento-card p-6 sm:p-8 bg-white space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Jadwal Piket Hari Ini</h3>
                  <p className="text-sm text-slate-500 font-medium mt-1">{ALL_DAYS[new Date().getDay()]}, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                </div>
                <button onClick={() => setActiveView('dashboard')} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"><X size={20} /></button>
              </div>

              {/* Today highlight */}
              <div className="p-6 bg-emerald-50 rounded-3xl border-2 border-emerald-200">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-3">📌 Bertugas Hari Ini</p>
                {schedules.filter(s => s.day === ALL_DAYS[new Date().getDay()]).length > 0 ? (
                  <div className="space-y-3">
                    {schedules.filter(s => s.day === ALL_DAYS[new Date().getDay()]).map(s => (
                      <div key={s.id} className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-emerald-100">
                        <div className="w-3 h-3 bg-emerald-500 rounded-full flex-shrink-0" />
                        <span className="text-base font-bold text-slate-900">{s.group_name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 font-medium italic">Tidak ada jadwal piket hari ini.</p>
                )}
              </div>

              {/* Full week schedule */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Jadwal Minggu Ini</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {DAYS_ORDER.map(day => {
                    const sched = schedules.find(s => s.day === day);
                    const isToday = day === ALL_DAYS[new Date().getDay()];
                    const isMyGroup = sched?.group_name === user.group_name;
                    return (
                      <div key={day} className={`p-4 rounded-2xl border-2 text-center transition-all ${isToday ? 'bg-emerald-50 border-emerald-200' : isMyGroup ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-100'}`}>
                        <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${isToday ? 'text-emerald-600' : isMyGroup ? 'text-blue-600' : 'text-slate-400'}`}>{day}</p>
                        {isToday && <span className="text-[9px] font-bold text-emerald-500 bg-emerald-100 px-2 py-0.5 rounded-full mb-2 inline-block">Hari Ini</span>}
                        {isMyGroup && !isToday && <span className="text-[9px] font-bold text-blue-500 bg-blue-100 px-2 py-0.5 rounded-full mb-2 inline-block">Giliran Anda</span>}
                        <p className={`text-sm font-bold ${sched ? (isToday ? 'text-emerald-900' : isMyGroup ? 'text-blue-900' : 'text-slate-700') : 'text-slate-300 italic'}`}>
                          {sched?.group_name || 'Kosong'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* View: History */}
      <AnimatePresence mode="wait">
        {activeView === 'history' && (
          <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className="bento-card p-6 bg-white space-y-6">
              <h3 className="text-lg font-bold text-slate-900">Riwayat Laporan Anda</h3>
              {history.length === 0 ? (
                <div className="py-16 text-center">
                  <History size={40} className="text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-400 font-medium">Belum ada riwayat laporan.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {history.map(report => (
                    <div key={report.id} className="p-5 rounded-3xl border border-slate-100 bg-slate-50/50 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-900">{report.date}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${report.status === 'Telat' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                              {report.status === 'Telat' ? 'Telat' : 'Tepat Waktu'}
                            </span>
                            <span className="text-xs text-slate-400 font-medium">{report.checkin_time} WIB</span>
                          </div>
                        </div>
                        {report.cleaning_photo && canEditReport(report) && (
                          <button onClick={() => { setEditingReport(report); setEditPhoto(null); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold border border-blue-100 hover:bg-blue-100 transition-all">
                            <Edit2 size={12} />Edit Foto
                          </button>
                        )}
                      </div>
                      {report.cleaning_photo && (
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><ImageIcon size={10} />Foto Kebersihan</p>
                          <div className="aspect-video rounded-2xl overflow-hidden cursor-pointer relative group" onClick={() => setPreviewImage(report.cleaning_photo)}>
                            <img src={report.cleaning_photo} alt="Kebersihan" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                              <Maximize2 size={24} className="text-white opacity-0 group-hover:opacity-100 transition-all" />
                            </div>
                          </div>
                        </div>
                      )}
                      {report.checkin_photo && (
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><ImageIcon size={10} />Foto Kehadiran</p>
                          <div className="aspect-video rounded-2xl overflow-hidden cursor-pointer relative group" onClick={() => setPreviewImage(report.checkin_photo)}>
                            <img src={report.checkin_photo} alt="Kehadiran" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                              <Maximize2 size={24} className="text-white opacity-0 group-hover:opacity-100 transition-all" />
                            </div>
                          </div>
                        </div>
                      )}
                      {report.absents && report.absents.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Tidak Hadir:</p>
                          <div className="flex flex-wrap gap-2">
                            {report.absents.map((a, i) => <span key={i} className="px-3 py-1 bg-red-50 text-red-600 text-xs font-bold rounded-full border border-red-100">{a.name}</span>)}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Edit photo modal */}
            {editingReport && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-slate-900">Edit Foto Laporan</h3>
                    <button onClick={() => setEditingReport(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"><X size={20} /></button>
                  </div>
                  <div className="space-y-6">
                    <label className="flex flex-col items-center p-8 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 cursor-pointer hover:border-blue-400 transition-all">
                      <Camera size={32} className="text-slate-400 mb-3" />
                      <span className="text-sm font-bold text-slate-600">{editPhoto ? editPhoto.name : 'Pilih foto baru'}</span>
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setEditPhoto(e.target.files?.[0] || null)} />
                    </label>
                    <div className="flex gap-3">
                      <button onClick={() => setEditingReport(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl">Batal</button>
                      <button onClick={handleEditPhoto} disabled={!editPhoto || editSubmitting}
                        className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all disabled:opacity-50">
                        {editSubmitting ? 'Menyimpan...' : 'Simpan'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </motion.div>
        )}

        {/* View: Dashboard */}
        {activeView === 'dashboard' && (
          <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: Attendance */}
              <div className="lg:col-span-5 space-y-6">
                <section className="bento-card p-6 sm:p-8 bg-white">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center"><MapPin size={20} /></div>
                      <h3 className="text-base font-bold text-slate-900">Kehadiran PJ</h3>
                    </div>
                    {isPastTimeLimit && !status && <span className="px-3 py-1 bg-red-50 text-red-600 text-[10px] font-bold rounded-full border border-red-100 uppercase tracking-widest">Tutup</span>}
                  </div>
                  {status ? (
                    <div className={`p-5 rounded-3xl border-2 ${status.status === 'Telat' ? 'bg-red-50/50 border-red-100' : 'bg-emerald-50/50 border-emerald-100'}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${status.status === 'Telat' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
                          {status.status === 'Telat' ? <Clock size={20} /> : <CheckCircle2 size={20} />}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Status Absensi</p>
                          <p className={`text-lg font-bold ${status.status === 'Telat' ? 'text-red-900' : 'text-emerald-900'}`}>
                            {status.status === 'Telat' ? 'Hadir (Terlambat)' : 'Hadir Tepat Waktu'}
                          </p>
                          <p className="text-sm font-medium text-slate-500">Pukul {status.checkin_time} WIB</p>
                        </div>
                      </div>
                      {/* Foto lampiran absensi */}
                      {status.checkin_photo && (
                        <div className="mt-4">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><ImageIcon size={10} />Foto Kehadiran</p>
                          <div className="rounded-2xl overflow-hidden cursor-pointer relative group aspect-video" onClick={() => setPreviewImage(status.checkin_photo)}>
                            <img src={status.checkin_photo} alt="Kehadiran" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                              <Maximize2 size={20} className="text-white opacity-0 group-hover:opacity-100 transition-all" />
                            </div>
                            <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/50 backdrop-blur-md text-white text-[10px] font-bold rounded-full">Klik untuk perbesar</div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <label className="flex flex-col items-center p-6 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200 group hover:border-emerald-500/50 transition-all cursor-pointer">
                        <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-3 group-hover:scale-110 transition-transform">
                          <Camera size={28} className="text-slate-400 group-hover:text-emerald-600 transition-colors" />
                        </div>
                        <span className="text-sm font-bold text-slate-600">{photo ? photo.name : 'Ambil Foto Kehadiran'}</span>
                        <p className="text-xs text-slate-400 mt-1">Pastikan wajah terlihat jelas</p>
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
                      </label>
                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${distance !== null && distance <= MAX_DISTANCE_METERS ? 'bg-emerald-500' : 'bg-red-500'} animate-pulse`} />
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Lokasi</span>
                        </div>
                        <span className={`text-sm font-bold ${distance !== null && distance <= MAX_DISTANCE_METERS ? 'text-emerald-600' : 'text-red-600'}`}>
                          {distance !== null ? `${Math.round(distance)}m` : 'Mencari...'}
                        </span>
                      </div>
                      <button onClick={handleAttendance} disabled={!photo || submitting || isPastTimeLimit || !isAssignedToday}
                        className="btn-primary w-full py-4 flex items-center justify-center gap-3">
                        {submitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> :
                          !isAssignedToday ? 'Bukan Jadwal Anda' : isPastTimeLimit ? 'Absensi Ditutup' : 'Konfirmasi Kehadiran'}
                      </button>
                    </div>
                  )}
                </section>

                {nextDuty && (
                  <div className="p-5 bg-slate-900 text-white rounded-[2rem] shadow-xl flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center shrink-0"><Calendar size={24} className="text-emerald-400" /></div>
                    <div>
                      <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-1">Tugas Berikutnya</p>
                      <p className="text-base font-bold leading-tight">Besok hari {nextDuty.day} Anda bertugas.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Cleaning Report */}
              <div className="lg:col-span-7">
                <section className="bento-card p-6 sm:p-8 bg-white h-full">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center"><ClipboardList size={20} /></div>
                    <h3 className="text-base font-bold text-slate-900">Laporan Kebersihan</h3>
                  </div>

                  {status?.cleaning_photo ? (
                    <div className="space-y-5">
                      <div className="p-6 bg-emerald-50/50 rounded-[2rem] border-2 border-emerald-100 text-center">
                        <div className="w-14 h-14 bg-emerald-600 text-white rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-100"><CheckCircle2 size={28} /></div>
                        <h4 className="text-lg font-bold text-emerald-900">Laporan Berhasil Terkirim</h4>
                        <p className="text-emerald-700 font-medium mt-2 text-sm">Terima kasih atas dedikasi Anda hari ini!</p>
                      </div>
                      {status.cleaning_photo && (
                        <div className="rounded-2xl overflow-hidden cursor-pointer relative group aspect-video" onClick={() => setPreviewImage(status.cleaning_photo)}>
                          <img src={status.cleaning_photo} alt="Kebersihan" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                            <Maximize2 size={24} className="text-white opacity-0 group-hover:opacity-100 transition-all" />
                          </div>
                          <div className="absolute bottom-3 right-3 px-3 py-1 bg-black/50 backdrop-blur-md text-white text-[10px] font-bold rounded-full">Klik untuk perbesar</div>
                        </div>
                      )}
                      {status.cleaning_description && (
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Anggota Tidak Hadir</p>
                          <p className="text-sm text-slate-700 font-medium whitespace-pre-wrap">{status.cleaning_description}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <label className="flex flex-col items-center p-6 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200 group hover:border-emerald-500/50 transition-all cursor-pointer">
                        <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-3 group-hover:scale-110 transition-transform">
                          <Camera size={28} className="text-slate-400 group-hover:text-emerald-600 transition-colors" />
                        </div>
                        <span className="text-sm font-bold text-slate-600">{cleaningPhoto ? cleaningPhoto.name : 'Foto Hasil Kebersihan'}</span>
                        <p className="text-xs text-slate-400 mt-1">Ambil foto kelas setelah dibersihkan</p>
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setCleaningPhoto(e.target.files?.[0] || null)} />
                      </label>

                      {/* Anggota Piket */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Users size={12} /> Anggota Piket Anda</p>
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">{pjMembers.length} Orang</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {pjMembers.map(m => (
                            <div key={m.id} className="flex flex-col gap-2 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                              <span className="text-sm font-bold text-slate-900">{m.name}</span>
                              <CustomDropdown
                                options={Object.values(MEMBER_STATUSES).map(s => ({ id: s, label: s }))}
                                value={memberStatuses[m.id]?.status || MEMBER_STATUSES.HADIR}
                                onChange={(val) => updateMemberStatus(m.id, val as MemberStatus)}
                              />
                            </div>
                          ))}
                          {pjMembers.length === 0 && (
                            <div className="col-span-2 py-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                              <p className="text-xs text-slate-400 font-medium italic">Belum ada anggota yang ditugaskan</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Anggota Tidak Masuk */}
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><AlertCircle size={12} /> Anggota Kelas Tidak Masuk</p>
                        <div className="space-y-3">
                          <div className="relative">
                            <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-2xl border border-slate-200 focus-within:ring-4 focus-within:ring-emerald-500/10 focus-within:border-emerald-500 transition-all">
                              <Search size={18} className="text-slate-400" />
                              <input type="text" placeholder="Cari nama teman sekelas..." className="flex-1 bg-transparent outline-none text-sm font-medium"
                                value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setShowSuggestions(true); }}
                                onFocus={() => setShowSuggestions(true)} />
                            </div>
                            <AnimatePresence>
                              {showSuggestions && searchTerm.length > 0 && (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                                  className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 z-30 max-h-52 overflow-y-auto py-2">
                                  {allMembers.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()))
                                    .filter(m => !selectedAbsentSchool.find(s => s.id === m.id))
                                    .filter(m => !pjMembers.find(p => p.id === m.id))
                                    .filter(m => !m.is_pj_group)
                                    .map(m => (
                                      <button key={m.id} onClick={() => { setSelectedAbsentSchool([...selectedAbsentSchool, m]); setSearchTerm(''); setShowSuggestions(false); }}
                                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">{m.name}</button>
                                    ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {selectedAbsentSchool.map(m => (
                              <div key={m.id} className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-700 rounded-xl border border-red-100">
                                <span className="text-xs font-bold">{m.name}</span>
                                <button onClick={() => removeSelectedAbsent(m.id)} className="p-0.5 hover:bg-red-100 rounded-full"><X size={12} /></button>
                              </div>
                            ))}
                            {selectedAbsentSchool.length === 0 && <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest italic">Belum ada anggota ditambahkan</p>}
                          </div>
                        </div>
                      </div>

                      <button onClick={handleReport} disabled={!cleaningPhoto || !status || submitting || !isAssignedToday}
                        className="btn-primary w-full py-4 flex items-center justify-center gap-3 text-base">
                        {submitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><CheckCircle2 size={20} />Kirim Laporan</>}
                      </button>
                      {!status && !isPastTimeLimit && isAssignedToday && <p className="text-center text-xs text-red-500 font-bold">⚠️ Harap absen kehadiran terlebih dahulu!</p>}
                    </div>
                  )}
                </section>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- ADMIN DASHBOARD ---
const AdminDashboard = ({ user }: { user: User }) => {
  const [reports, setReports] = useState<any[]>([]);
  const [members, setMembers] = useState<ClassMember[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'reports' | 'members' | 'users' | 'schedules' | 'settings'>('reports');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: string; id: number; name?: string; onConfirm?: () => void } | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Folders state
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

  // Forms
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [newMember, setNewMember] = useState({ name: '', pj_id: '' });
  const [editingMember, setEditingMember] = useState<ClassMember | null>(null);

  const [showUserForm, setShowUserForm] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', group_name: '' });
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [showCode, setShowCode] = useState<Record<string | number, boolean>>({});

  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [newSchedule, setNewSchedule] = useState({ group_name: '', day: 'Senin' });
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [rep, mem, usr, sch, set] = await Promise.all([
        safeFetch('/api/all-reports'), safeFetch('/api/members'), safeFetch('/api/users'),
        safeFetch('/api/schedules'), safeFetch('/api/settings')
      ]);
      setReports(rep); setMembers(mem); setUsers(usr); setSchedules(sch); setSettings(set);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleDelete = async (type: string, id: number) => {
    try { await safeFetch(`/api/${type}s/${id}`, { method: 'DELETE' }); fetchData(); }
    catch (err) { console.error(err); }
  };

  const handleScheduleDelete = async (id: number) => {
    try { await safeFetch(`/api/schedules/${id}`, { method: 'DELETE' }); fetchData(); }
    catch (err) { console.error(err); }
  };

  const confirmDelete = (type: string, id: number, name?: string) => {
    setConfirmAction({ type, id, name });
    setIsConfirmOpen(true);
  };

  const handleReset = (type: string) => {
    setConfirmAction({
      type: 'reset', id: 0, name: `SEMUA DATA ${type.toUpperCase()}`,
      onConfirm: async () => {
        try { await safeFetch(`/api/${type}/reset`, { method: 'POST' }); fetchData(); }
        catch (err) { console.error(err); }
      }
    });
    setIsConfirmOpen(true);
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingMember) await safeFetch(`/api/members/${editingMember.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newMember) });
      else await safeFetch('/api/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newMember) });
      setNewMember({ name: '', pj_id: '' }); setEditingMember(null); setShowMemberForm(false); fetchData();
    } catch { alert('Gagal menyimpan anggota'); }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await safeFetch(`/api/users/${editingUser.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newUser) });
        setEditingUser(null);
      } else {
        const data = await safeFetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...newUser, role: 'pj' }) });
        setGeneratedCode(data.account_code);
      }
      setNewUser({ name: '', group_name: '' }); setShowUserForm(false); fetchData();
    } catch { alert('Gagal menyimpan PJ'); }
  };

  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingSchedule) {
        await safeFetch(`/api/schedules/${editingSchedule.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSchedule) });
        setEditingSchedule(null);
      } else {
        await safeFetch('/api/schedules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSchedule) });
      }
      setNewSchedule({ group_name: '', day: 'Senin' }); setShowScheduleForm(false); fetchData();
    } catch (err: any) { alert(err.message || 'Gagal menyimpan jadwal'); }
  };

  const handleRegenerateCode = async (userId: number | string) => {
    try {
      const data = await safeFetch(`/api/users/${userId}/regenerate-code`, { method: 'POST' });
      setShowCode(prev => ({ ...prev, [userId]: true }));
      fetchData();
      alert(`Kode baru: ${data.account_code}`);
    } catch (err: any) { alert(err.message); }
  };

  const updateSetting = async (key: string, value: any) => {
    try {
      await safeFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) });
      if (key === 'testing_mode') {
        // Reload to ensure clean state when testing mode changes
        setTimeout(() => window.location.reload(), 300);
      } else {
        fetchData();
      }
    }
    catch { alert('Gagal memperbarui pengaturan'); }
  };

  const promoteToPJ = async (member: ClassMember) => {
    try {
      const data = await safeFetch('/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: member.name, role: 'pj', member_id: member.id, group_name: 'Kelompok ' + member.name })
      });
      setGeneratedCode(data.account_code);
      await fetchData();
      setActiveTab('users');
    } catch { alert('Gagal mempromosikan anggota.'); }
  };

  // Group reports by date/folder
  const today = getTodayStr();
  const todayReports = reports.filter(r => r.date === today);
  const archivedReports = reports.filter(r => r.date !== today);
  const archivedByDate = archivedReports.reduce((acc: Record<string, any[]>, r) => {
    if (!acc[r.date]) acc[r.date] = [];
    acc[r.date].push(r);
    return acc;
  }, {});

  // Group members by PJ - dynamic: folder name follows PJ's current name from users list
  const membersWithPj = members.filter(m => m.pj_id);
  const membersWithoutPj = members.filter(m => !m.pj_id);
  // Build map keyed by pj_id so we can look up current PJ name dynamically
  const membersByPjId = membersWithPj.reduce((acc: Record<number, { pjUser: User | undefined; members: ClassMember[] }>, m) => {
    const pjId = m.pj_id!;
    if (!acc[pjId]) {
      acc[pjId] = { pjUser: users.find(u => u.id === pjId), members: [] };
    }
    acc[pjId].members.push(m);
    return acc;
  }, {});

  const toggleFolder = (key: string) => {
    setOpenFolders(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const availableDaysForSchedule = DAYS_ORDER.filter(day => {
    if (editingSchedule && editingSchedule.day === day) return true;
    return !schedules.some(s => s.day === day);
  });

  if (loading) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-slate-500 font-medium">Memuat Data Admin...</p>
    </div>
  );

  const tabs = [
    { id: 'reports', label: 'Laporan', icon: ClipboardList },
    { id: 'members', label: 'Anggota', icon: Users },
    { id: 'users', label: 'PJ Piket', icon: ShieldCheck },
    { id: 'schedules', label: 'Jadwal', icon: Calendar },
    { id: 'settings', label: 'Pengaturan', icon: Settings }
  ];

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {previewImage && <ImagePreviewModal src={previewImage} onClose={() => setPreviewImage(null)} />}

      {/* Generated Code Modal */}
      {generatedCode && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl">
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-emerald-100 rounded-3xl flex items-center justify-center mx-auto"><Key size={32} className="text-emerald-600" /></div>
              <div>
                <h3 className="text-2xl font-bold text-slate-900 mb-2">Kode Akun Dibuat!</h3>
                <p className="text-slate-500 font-medium text-sm">Berikan kode ini kepada PJ. Simpan dengan aman.</p>
              </div>
              <div className="p-6 bg-emerald-50 rounded-3xl border border-emerald-200">
                <p className="text-3xl font-mono font-bold text-slate-900 tracking-[0.3em] mb-3">{generatedCode}</p>
                <button onClick={() => { navigator.clipboard.writeText(generatedCode); }}
                  className="flex items-center gap-2 mx-auto px-4 py-2 bg-white rounded-xl border border-emerald-200 text-emerald-600 font-bold text-sm hover:bg-emerald-50 transition-all">
                  <Copy size={16} />Salin Kode
                </button>
              </div>
              <button onClick={() => setGeneratedCode(null)} className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all">Tutup</button>
            </div>
          </motion.div>
        </div>
      )}

      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Panel Administrasi 🛠️</h2>
          <p className="text-slate-500 font-medium mt-1 text-sm">Kelola data laporan, anggota, dan jadwal piket.</p>
        </div>
        {/* Tab navigation - scrollable on mobile */}
        <div className="flex bg-slate-100 p-1.5 rounded-2xl overflow-x-auto scrollbar-hide gap-0.5 flex-shrink-0">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 sm:px-5 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap flex-shrink-0 ${activeTab === tab.id ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <tab.icon size={16} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </header>

      <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bento-card bg-white min-h-[500px]">

        {/* REPORTS TAB */}
        {activeTab === 'reports' && (
          <div className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <h3 className="text-xl font-bold text-slate-900">Riwayat Laporan</h3>
              <div className="flex items-center gap-3">
                <button onClick={() => handleReset('reports')} className="px-4 py-2 bg-red-50 text-red-600 text-xs font-bold rounded-xl border border-red-100 hover:bg-red-600 hover:text-white transition-all">Reset Laporan</button>
                <button onClick={fetchData} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400"><RefreshCw size={20} /></button>
              </div>
            </div>

            {/* Today's reports */}
            {todayReports.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Laporan Hari Ini</span>
                </div>
                <div className="space-y-5">
                  {todayReports.map(report => <ReportCard key={report.id} report={report} onDelete={() => confirmDelete('report', report.id, report.date)} onPreview={setPreviewImage} />)}
                </div>
              </div>
            )}

            {/* Archived reports in folders */}
            {Object.keys(archivedByDate).sort((a, b) => b.localeCompare(a)).map(date => (
              <div key={date} className="mb-3">
                <button onClick={() => toggleFolder(`report-${date}`)}
                  className="w-full flex items-center gap-3 p-4 bg-slate-50 hover:bg-slate-100 rounded-2xl border border-slate-100 transition-all group">
                  {openFolders.has(`report-${date}`) ? <FolderOpen size={18} className="text-amber-500" /> : <Folder size={18} className="text-slate-400 group-hover:text-amber-500 transition-colors" />}
                  <span className="text-sm font-bold text-slate-700">{date}</span>
                  <span className="ml-auto text-xs font-bold text-slate-400">{archivedByDate[date].length} laporan</span>
                  <ChevronDown size={16} className={`text-slate-400 transition-transform ${openFolders.has(`report-${date}`) ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {openFolders.has(`report-${date}`) && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="pl-4 pt-3 space-y-4">
                        {archivedByDate[date].map(report => <ReportCard key={report.id} report={report} onDelete={() => confirmDelete('report', report.id, report.date)} onPreview={setPreviewImage} />)}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}

            {reports.length === 0 && (
              <div className="py-20 text-center">
                <div className="w-20 h-20 bg-slate-50 text-slate-300 rounded-3xl flex items-center justify-center mx-auto mb-4"><ClipboardList size={40} /></div>
                <p className="text-slate-400 font-medium">Belum ada laporan yang masuk.</p>
              </div>
            )}
          </div>
        )}

        {/* MEMBERS TAB */}
        {activeTab === 'members' && (
          <div className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Daftar Anggota Kelas</h3>
                <p className="text-sm text-slate-500 font-medium">Total: {members.length} Anggota</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => { setEditingMember(null); setNewMember({ name: '', pj_id: '' }); setShowMemberForm(!showMemberForm); }}
                  className="btn-primary px-4 py-2.5 flex items-center gap-2 text-sm">
                  <Plus size={16} />Tambah Anggota
                </button>
                <button onClick={() => handleReset('members')} className="px-4 py-2.5 bg-red-50 text-red-600 text-xs font-bold rounded-xl border border-red-100 hover:bg-red-600 hover:text-white transition-all">Reset</button>
              </div>
            </div>

            <AnimatePresence>
              {showMemberForm && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-8">
                  <form onSubmit={handleAddMember} className="p-6 bg-slate-50 rounded-3xl border border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nama Anggota</label>
                      <input type="text" required className="input-field" placeholder="Nama Lengkap" value={newMember.name} onChange={(e) => setNewMember({ ...newMember, name: e.target.value })} />
                    </div>
                    {users.find(u => u.name === newMember.name)?.role !== 'pj' && (
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Pilih PJ Piket</label>
                        <CustomDropdown
                          options={[{ id: '', label: 'Tanpa PJ' }, ...users.filter(u => u.role === 'pj').map(u => ({ id: u.id, label: u.name }))]}
                          value={newMember.pj_id} onChange={(val) => setNewMember({ ...newMember, pj_id: val })}
                        />
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button type="submit" className="flex-1 btn-primary py-3 text-sm">{editingMember ? 'Simpan' : 'Tambah'}</button>
                      <button type="button" onClick={() => setShowMemberForm(false)} className="px-4 py-3 bg-white text-slate-400 border border-slate-200 rounded-2xl hover:bg-slate-50"><X size={20} /></button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Members without PJ */}
            {membersWithoutPj.length > 0 && (
              <div className="mb-6">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Tanpa Kelompok</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {membersWithoutPj.map(member => (
                    <MemberCard key={member.id} member={member} users={users} onEdit={() => { setEditingMember(member); setNewMember({ name: member.name, pj_id: member.pj_id?.toString() || '' }); setShowMemberForm(true); }}
                      onDelete={() => confirmDelete('member', member.id, member.name)} onPromote={() => promoteToPJ(member)} />
                  ))}
                </div>
              </div>
            )}

            {/* Members grouped by PJ folder */}
            {Object.keys(membersByPjId).map(pjIdStr => {
              const { pjUser, members: pjMembers } = membersByPjId[parseInt(pjIdStr)];
              const folderLabel = pjUser?.name || 'Unknown';
              const folderKey = `member-pj-${pjIdStr}`;
              return (
                <div key={pjIdStr} className="mb-3">
                  <button onClick={() => toggleFolder(folderKey)}
                    className="w-full flex items-center gap-3 p-4 bg-blue-50/50 hover:bg-blue-100/50 rounded-2xl border border-blue-100 transition-all group mb-2">
                    {openFolders.has(folderKey) ? <FolderOpen size={18} className="text-blue-500" /> : <Folder size={18} className="text-blue-400 group-hover:text-blue-500 transition-colors" />}
                    <span className="text-sm font-bold text-slate-700">Kelompok {folderLabel}</span>
                    <span className="ml-auto text-xs font-bold text-blue-400">{pjMembers.length} Anggota</span>
                    <ChevronDown size={16} className={`text-slate-400 transition-transform ${openFolders.has(folderKey) ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {openFolders.has(folderKey) && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                        <div className="pl-4 pt-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pb-3">
                          {pjMembers.map(member => (
                            <MemberCard key={member.id} member={member} users={users}
                              onEdit={() => { setEditingMember(member); setNewMember({ name: member.name, pj_id: member.pj_id?.toString() || '' }); setShowMemberForm(true); }}
                              onDelete={() => confirmDelete('member', member.id, member.name)} onPromote={() => promoteToPJ(member)} />
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}

        {/* USERS TAB */}
        {activeTab === 'users' && (
          <div className="p-6 sm:p-8">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-bold text-slate-900">Daftar Akun</h3>
              <div className="flex items-center gap-3">
                <button onClick={() => handleReset('users')} className="px-4 py-2.5 bg-red-50 text-red-600 text-xs font-bold rounded-xl border border-red-100 hover:bg-red-600 hover:text-white transition-all">Reset</button>
              </div>
            </div>

            {/* Admin Card */}
            <div className="mb-8 p-6 rounded-3xl border border-slate-200 bg-slate-50/50">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg"><ShieldCheck size={24} /></div>
                  <div>
                    <h4 className="font-bold text-slate-900">{user.name}</h4>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Admin</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-slate-200">
                    <span className="font-mono text-sm font-bold text-slate-600">{showCode['admin'] ? (users.find(u => u.role === 'admin')?.account_code || '••••••••') : '••••••••'}</span>
                    <button onClick={() => setShowCode(p => ({ ...p, admin: !p['admin'] }))} className="text-slate-400 hover:text-slate-600">
                      {showCode['admin'] ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <button onClick={() => handleRegenerateCode(users.find(u => u.role === 'admin')?.id || 0)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition-all">
                    <RefreshCw size={14} />Generate Ulang Kode
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {users.filter(u => u.role === 'pj').map(pj => (
                <div key={pj.id} className="p-6 rounded-3xl border border-slate-100 bg-slate-50/50 space-y-4 hover:border-blue-200 transition-all group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-100"><ShieldCheck size={22} /></div>
                      <div>
                        <h4 className="font-bold text-slate-900">{pj.name}</h4>
                        <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">penanggung jawab</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={() => confirmDelete('user', pj.id, pj.name)}
                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><Trash2 size={16} /></button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-2 flex-1 px-3 py-2 bg-white rounded-xl border border-slate-100">
                      <span className="font-mono text-sm font-bold text-slate-600 flex-1">
                        {showCode[pj.id] ? (pj.account_code || '------') : '••••••'}
                      </span>
                      <button onClick={() => setShowCode(p => ({ ...p, [pj.id]: !p[pj.id] }))} className="text-slate-400 hover:text-slate-600">
                        {showCode[pj.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <button onClick={() => handleRegenerateCode(pj.id)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-bold rounded-xl border border-slate-200 transition-all whitespace-nowrap">
                      <RefreshCw size={12} />Generate Ulang
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {users.filter(u => u.role === 'pj').length === 0 && !showUserForm && (
              <div className="py-20 text-center">
                <ShieldCheck size={40} className="text-slate-300 mx-auto mb-4" />
                <p className="text-slate-400 font-medium mb-4">Belum ada PJ yang terdaftar.</p>
              </div>
            )}
          </div>
        )}

        {/* SCHEDULES TAB */}
        {activeTab === 'schedules' && (
          <div className="p-6 sm:p-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Jadwal Piket Mingguan</h3>
                <p className="text-sm text-slate-500 font-medium mt-1">Satu PJ per hari, Senin–Jumat</p>
              </div>
              {availableDaysForSchedule.length > 0 && (
                <button onClick={() => { setEditingSchedule(null); setNewSchedule({ group_name: '', day: availableDaysForSchedule[0] }); setShowScheduleForm(!showScheduleForm); }}
                  className="btn-primary px-4 py-2.5 flex items-center gap-2 text-sm">
                  <Plus size={16} />Tambah Jadwal
                </button>
              )}
            </div>

            <AnimatePresence>
              {showScheduleForm && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-8">
                  <form onSubmit={handleAddSchedule} className="p-6 bg-slate-50 rounded-3xl border border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Hari</label>
                      <CustomDropdown
                        options={availableDaysForSchedule.map(d => ({ id: d, label: d }))}
                        value={newSchedule.day} onChange={(val) => setNewSchedule({ ...newSchedule, day: val })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Kelompok PJ</label>
                      <CustomDropdown
                        options={[{ id: '', label: 'Pilih Kelompok...' }, ...Array.from(new Set(users.filter(u => u.role === 'pj').map(u => u.group_name))).filter((g): g is string => !!g).map(g => ({ id: g, label: g }))]}
                        value={newSchedule.group_name} onChange={(val) => setNewSchedule({ ...newSchedule, group_name: val })}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button type="submit" disabled={!newSchedule.group_name} className="flex-1 btn-primary py-3 text-sm disabled:opacity-50">Simpan</button>
                      <button type="button" onClick={() => { setShowScheduleForm(false); setEditingSchedule(null); }} className="px-4 py-3 bg-white text-slate-400 border border-slate-200 rounded-2xl hover:bg-slate-50"><X size={20} /></button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Visual schedule grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {DAYS_ORDER.map(day => {
                const sched = schedules.find(s => s.day === day);
                const isToday = day === ALL_DAYS[new Date().getDay()];
                return (
                  <div key={day} className={`p-5 rounded-3xl border-2 transition-all ${isToday ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-slate-50/50'}`}>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className={`text-xs font-bold uppercase tracking-widest ${isToday ? 'text-emerald-600' : 'text-slate-400'}`}>{day}</p>
                        {isToday && <span className="text-[10px] font-bold text-emerald-500 bg-emerald-100 px-2 py-0.5 rounded-full mt-1 inline-block">Hari Ini</span>}
                      </div>
                      {sched && (
                        <button onClick={() => { setEditingSchedule(sched); setNewSchedule({ group_name: sched.group_name, day: sched.day }); setShowScheduleForm(true); }}
                          className="p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"><Edit2 size={14} /></button>
                      )}
                    </div>
                    {sched ? (
                      <div className="space-y-3">
                        <div className={`px-3 py-2 rounded-xl text-sm font-bold ${isToday ? 'bg-emerald-100 text-emerald-800' : 'bg-white text-slate-700 border border-slate-100'}`}>
                          {sched.group_name}
                        </div>
                        <button onClick={() => { setConfirmAction({ type: 'schedule', id: sched.id, name: `${day}: ${sched.group_name}`, onConfirm: () => handleScheduleDelete(sched.id) }); setIsConfirmOpen(true); }}
                          className="w-full py-2 text-[10px] font-bold text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all uppercase tracking-widest border border-dashed border-slate-200 hover:border-red-200">
                          Hapus Jadwal
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingSchedule(null); setNewSchedule({ group_name: '', day }); setShowScheduleForm(true); }}
                        className="w-full py-4 text-xs font-bold text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all border border-dashed border-slate-200 hover:border-emerald-300 flex items-center justify-center gap-2">
                        <Plus size={14} />Tambahkan PJ
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div className="p-6 sm:p-8 space-y-8">
            <h3 className="text-xl font-bold text-slate-900">Pengaturan Sistem</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Time limit */}
              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center"><Clock size={20} /></div>
                  <div>
                    <h4 className="font-bold text-slate-900">Batas Waktu Laporan</h4>
                    <p className="text-xs text-slate-500 font-medium">PJ tidak bisa absen/lapor setelah jam ini.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input type="time" className="input-field max-w-[150px]" value={settings.report_time_limit || '07:00'} onChange={(e) => updateSetting('report_time_limit', e.target.value)} />
                  <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">WIB</span>
                </div>
              </div>
              {/* Edit time limit */}
              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center"><Edit2 size={20} /></div>
                  <div>
                    <h4 className="font-bold text-slate-900">Batas Edit Foto Laporan</h4>
                    <p className="text-xs text-slate-500 font-medium">PJ dapat edit foto laporan dalam waktu ini.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input type="number" min="1" max="60" className="input-field max-w-[100px]" value={settings.edit_time_limit_minutes || '15'} onChange={(e) => updateSetting('edit_time_limit_minutes', e.target.value)} />
                  <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Menit</span>
                </div>
              </div>
              {/* Test Mode */}
              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center"><FlaskConical size={20} /></div>
                    <div>
                      <h4 className="font-bold text-slate-900">Test Mode</h4>
                      <p className="text-xs text-slate-500 font-medium">Abaikan batas waktu & lokasi untuk testing.</p>
                    </div>
                  </div>
                  <button onClick={() => updateSetting('testing_mode', settings.testing_mode === 'true' ? 'false' : 'true')}
                    className={`w-14 h-8 rounded-full transition-all relative flex-shrink-0 ${settings.testing_mode === 'true' ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                    <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all shadow-sm ${settings.testing_mode === 'true' ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>
                {settings.testing_mode === 'true' && (
                  <div className="p-3 bg-amber-50 text-amber-700 text-[10px] font-bold rounded-xl border border-amber-100 flex items-center gap-2">
                    <Info size={14} />MODE TESTING AKTIF — Batas waktu & lokasi tidak dicek.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </motion.div>

      <ConfirmDialog isOpen={isConfirmOpen} onClose={() => setIsConfirmOpen(false)}
        onConfirm={() => {
          if (confirmAction) {
            if (confirmAction.onConfirm) confirmAction.onConfirm();
            else handleDelete(confirmAction.type, confirmAction.id);
          }
          setIsConfirmOpen(false);
        }}
        title="Konfirmasi Tindakan"
        message={`Apakah Anda yakin ingin menghapus/mereset ${confirmAction?.name || 'data ini'}? Tindakan ini tidak dapat dibatalkan.`}
      />
    </div>
  );
};

// Sub-components
const ReportCard = ({ report, onDelete, onPreview }: { report: any; key?: any; onDelete: () => void; onPreview: (src: string) => void }) => (
  <div className="p-5 sm:p-6 rounded-3xl border border-slate-100 bg-slate-50/30 hover:bg-slate-50 transition-colors group">
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="lg:w-1/3 space-y-3">
        {report.cleaning_photo ? (
          <div className="aspect-video rounded-2xl overflow-hidden bg-slate-200 relative cursor-pointer group/img" onClick={() => onPreview(report.cleaning_photo)}>
            <img src={report.cleaning_photo} alt="Cleaning" className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300" referrerPolicy="no-referrer" />
            <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition-all flex items-center justify-center">
              <Maximize2 size={20} className="text-white opacity-0 group-hover/img:opacity-100 transition-all" />
            </div>
            <div className="absolute top-3 left-3 px-2 py-1 bg-black/50 backdrop-blur-md text-white text-[10px] font-bold rounded-full">Hasil Kebersihan</div>
          </div>
        ) : (
          <div className="aspect-video rounded-2xl bg-slate-100 flex items-center justify-center"><ImageIcon size={32} className="text-slate-300" /></div>
        )}
        {/* Foto Kehadiran lampiran */}
        {report.checkin_photo && (
          <div className="aspect-video rounded-2xl overflow-hidden bg-slate-200 relative cursor-pointer group/img2" onClick={() => onPreview(report.checkin_photo)}>
            <img src={report.checkin_photo} alt="Kehadiran" className="w-full h-full object-cover group-hover/img2:scale-105 transition-transform duration-300" referrerPolicy="no-referrer" />
            <div className="absolute inset-0 bg-black/0 group-hover/img2:bg-black/30 transition-all flex items-center justify-center">
              <Maximize2 size={20} className="text-white opacity-0 group-hover/img2:opacity-100 transition-all" />
            </div>
            <div className="absolute top-3 left-3 px-2 py-1 bg-black/50 backdrop-blur-md text-white text-[10px] font-bold rounded-full">Foto Kehadiran</div>
          </div>
        )}
      </div>
      <div className="flex-1 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-emerald-600">{report.pj_name}</p>
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${report.status === 'Telat' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                {report.status === 'Telat' ? '⚠ Telat' : '✓ Tepat Waktu'}
              </span>
            </div>
            <h4 className="text-base font-bold text-slate-900 mt-1">Laporan {report.date}</h4>
            <p className="text-xs text-slate-400 font-medium">{report.checkin_time} WIB</p>
          </div>
          <button onClick={onDelete} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all flex-shrink-0"><Trash2 size={16} /></button>
        </div>
        {report.cleaning_description && report.cleaning_description !== 'Semua anggota hadir' && (
          <div className="p-4 bg-white rounded-2xl border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Anggota Tidak Hadir</p>
            <p className="text-sm text-slate-600 whitespace-pre-wrap font-medium">{report.cleaning_description}</p>
          </div>
        )}
        {report.cleaning_description === 'Semua anggota hadir' && (
          <div className="px-4 py-2 bg-emerald-50 rounded-xl inline-block text-emerald-700 text-xs font-bold">✓ Semua anggota hadir</div>
        )}
        {report.absents && report.absents.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {report.absents.map((m: any, idx: number) => (
              <span key={idx} className="px-3 py-1 bg-red-50 text-red-600 text-[10px] font-bold rounded-full border border-red-100">{m.name}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
);

const MemberCard = ({ member, users, onEdit, onDelete, onPromote }: { member: ClassMember; key?: any; users: User[]; onEdit: () => void; onDelete: () => void; onPromote: () => void }) => {
  const isPJ = !!member.is_pj_group;
  return (
    <div className={`p-4 rounded-2xl border flex items-center justify-between group transition-all ${isPJ ? 'bg-blue-50/80 border-blue-200 hover:bg-blue-100/80 hover:border-blue-300' : 'bg-slate-50/50 border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/30'}`}>
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shadow-sm text-sm transition-colors ${isPJ ? 'bg-blue-600 text-white' : 'bg-white text-slate-400 group-hover:text-emerald-600'}`}>
          {member.name.charAt(0)}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className={`text-sm font-bold ${isPJ ? 'text-blue-900' : 'text-slate-900'}`}>{member.name}</p>
            {isPJ && <span className="text-[9px] font-bold text-blue-600 uppercase tracking-widest">PJ</span>}
          </div>
          {!isPJ && (
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              PJ: {users.find(u => u.id === member.pj_id)?.name || 'None'}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
        {!isPJ && (
          <button onClick={onPromote} title="Jadikan PJ" className="p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"><ShieldCheck size={14} /></button>
        )}
        <button onClick={onEdit} className="p-1.5 text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-all"><Edit2 size={14} /></button>
        <button onClick={onDelete} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={14} /></button>
      </div>
    </div>
  );
};

// --- MAIN APP ---
export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('piket_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [adminExists, setAdminExists] = useState<boolean | null>(null);
  const [activeTestPage, setActiveTestPage] = useState(false);
  const [settings, setSettings] = useState<any>({});

  useEffect(() => {
    safeFetch('/api/admin-exists').then(d => setAdminExists(d.exists)).catch(() => setAdminExists(false));
    if (user) safeFetch('/api/settings').then(setSettings).catch(() => { });
  }, [user]);

  const handleLogin = (u: User) => {
    setUser(u);
    localStorage.setItem('piket_user', JSON.stringify(u));
    safeFetch('/api/settings').then(setSettings).catch(() => { });
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('piket_user');
    setActiveTestPage(false);
  };

  const handleSetup = (code: string) => {
    setAdminExists(true);
  };

  // Setup page
  if (adminExists === false) return <SetupPage onSetup={handleSetup} />;
  if (adminExists === null) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // Login
  if (!user) return <LoginPage onLogin={handleLogin} />;

  const isTestingMode = settings.testing_mode === 'true';

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <nav className="bg-white/80 backdrop-blur-md border-b border-slate-100 px-4 sm:px-6 py-4 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-emerald-600 text-white rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-100 flex-shrink-0">
              <ShieldCheck size={20} />
            </div>
            <h1 className="font-bold text-slate-900 text-base sm:text-lg tracking-tight hidden sm:block truncate">Sistem Piket</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Test page nav - only admin & testing mode */}
            {user.role === 'admin' && isTestingMode && (
              <button onClick={() => setActiveTestPage(!activeTestPage)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${activeTestPage ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'}`}>
                <FlaskConical size={14} />
                <span className="hidden sm:inline">Testing</span>
              </button>
            )}
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-bold text-slate-900 truncate max-w-[120px]">{user.name}</span>
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">{user.role}</span>
            </div>
            <div className="w-px h-7 bg-slate-200 hidden sm:block" />
            <button onClick={handleLogout} className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all" title="Keluar">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </nav>

      <main className="py-6 sm:py-8">
        {user.role === 'admin' && activeTestPage
          ? <TestingPage />
          : user.role === 'admin'
            ? <AdminDashboard user={user} />
            : <PJDashboard user={user} />
        }
      </main>
    </div>
  );
}
