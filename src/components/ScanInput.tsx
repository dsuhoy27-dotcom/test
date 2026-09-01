import React, { useState } from 'react';
import { Search, Globe, Layers, ArrowRight, CheckCircle, AlertTriangle, ShieldAlert } from 'lucide-react';
import { PresetSite } from '../types';

interface ScanInputProps {
  onStartScan: (url: string, deepScan: boolean, maxPages: number) => void;
  isLoading: boolean;
  presets: PresetSite[];
}

export const ScanInput: React.FC<ScanInputProps> = ({ onStartScan, isLoading, presets }) => {
  const [url, setUrl] = useState('https://gosuslugi.ru');
  const [deepScan, setDeepScan] = useState(true);
  const [maxPages, setMaxPages] = useState(5);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    onStartScan(url.trim(), deepScan, maxPages);
  };

  const handleSelectPreset = (presetUrl: string) => {
    setUrl(presetUrl);
    onStartScan(presetUrl, deepScan, maxPages);
  };

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F1F5F9] border border-[#E2E8F0] text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-3">
            <span>Аудит соответствия закону</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] tracking-tight">
            Комплексный аудит сайта на соблюдение 152-ФЗ
          </h1>
          <p className="text-[#64748B] text-sm sm:text-base mt-2 max-w-2xl mx-auto leading-relaxed">
            Автоматический анализ веб-форм, чекбоксов согласия, Политики конфиденциальности, Cookie-баннеров,
            SSL-сертификата и локализации серверов в РФ по ст. 13.11 КоАП РФ.
          </p>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative flex flex-col sm:flex-row items-stretch gap-3">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#64748B]">
                <Globe className="w-5 h-5 text-[#2563EB]" />
              </div>
              <input
                id="url-scan-input"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://vash-sait.ru"
                disabled={isLoading}
                className="w-full pl-11 pr-4 py-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl text-[#0F172A] placeholder-[#94A3B8] text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all font-mono disabled:opacity-50"
              />
            </div>

            <button
              id="start-audit-button"
              type="submit"
              disabled={isLoading || !url.trim()}
              className="px-6 py-3.5 bg-[#0F172A] hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm sm:text-base rounded-2xl transition-all shadow-sm flex items-center justify-center gap-2 min-w-[170px]"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Сканирование...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Запустить аудит</span>
                  <ArrowRight className="w-4 h-4 ml-0.5" />
                </>
              )}
            </button>
          </div>

          {/* Options */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 text-xs text-[#64748B]">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={deepScan}
                onChange={(e) => setDeepScan(e.target.checked)}
                className="w-4 h-4 rounded bg-[#F8FAFC] border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB]"
              />
              <span className="text-[#475569] font-medium">Глубокий анализ (до 5 связанных страниц и вложенных форм)</span>
            </label>

            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-[#94A3B8]" />
              <span>Лимит страниц:</span>
              <select
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value))}
                className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2.5 py-1 text-[#0F172A] text-xs focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
              >
                <option value={1}>1 (Главная)</option>
                <option value={3}>3 страницы</option>
                <option value={5}>5 страниц</option>
                <option value={10}>10 страниц</option>
              </select>
            </div>
          </div>
        </form>

        {/* Demo Presets Bar */}
        {presets && presets.length > 0 && (
          <div className="mt-8 pt-6 border-t border-[#F1F5F9]">
            <div className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-3">
              Быстрый тест профилей соответствия 152-ФЗ:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {presets.map((preset) => {
                const isCompliant = preset.expectedScore === 100;
                const isMedium = preset.expectedScore >= 60 && preset.expectedScore < 90;
                const isCritical = preset.expectedScore < 40;

                return (
                  <button
                    key={preset.id}
                    id={`preset-${preset.id}`}
                    onClick={() => handleSelectPreset(preset.url)}
                    disabled={isLoading}
                    className="flex items-start justify-between p-3.5 rounded-2xl bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] hover:border-[#CBD5E1] transition-all text-left group"
                  >
                    <div className="pr-2 min-w-0">
                      <div className="flex items-center gap-1.5 font-semibold text-xs text-[#0F172A] group-hover:text-[#2563EB] transition-colors truncate">
                        {isCompliant && <CheckCircle className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />}
                        {isMedium && <AlertTriangle className="w-3.5 h-3.5 text-[#D97706] shrink-0" />}
                        {isCritical && <ShieldAlert className="w-3.5 h-3.5 text-[#DC2626] shrink-0" />}
                        <span className="truncate">{preset.name}</span>
                      </div>
                      <div className="text-[11px] text-[#64748B] font-mono mt-0.5 truncate">{preset.url}</div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border ${
                        isCompliant
                          ? 'bg-[#DCFCE7] text-[#166534] border-[#BBF7D0]'
                          : isMedium
                          ? 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]'
                          : 'bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]'
                      }`}
                    >
                      {preset.tag}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
