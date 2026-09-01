import React from 'react';
import { Shield, Lock, Server, FileText, CheckSquare, Cookie, Sparkles, AlertCircle } from 'lucide-react';
import { TaskStatusResponse } from '../types';

interface ScanProgressProps {
  statusData: TaskStatusResponse | null;
  targetUrl: string;
}

export const ScanProgress: React.FC<ScanProgressProps> = ({ statusData, targetUrl }) => {
  const progress = statusData ? statusData.progress : 15;
  const currentStep = statusData ? statusData.current_step : 'Инициализация парсера...';

  const steps = [
    { title: 'SSL/TLS & HTTPS', icon: Lock, activeThreshold: 10, doneThreshold: 25 },
    { title: 'Локализация (РФ)', icon: Server, activeThreshold: 25, doneThreshold: 45 },
    { title: 'Сбор веб-форм и ПДн', icon: FileText, activeThreshold: 45, doneThreshold: 65 },
    { title: 'Чекбоксы & Согласие', icon: CheckSquare, activeThreshold: 65, doneThreshold: 80 },
    { title: 'Cookie-баннеры & Политика', icon: Cookie, activeThreshold: 80, doneThreshold: 95 },
    { title: 'Расчет рисков КоАП РФ', icon: Shield, activeThreshold: 95, doneThreshold: 100 },
  ];

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
      {/* Target URL header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-6 border-b border-[#F1F5F9]">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-[#2563EB]">
            Идет автоматический аудит сайта
          </div>
          <div className="text-xl font-bold text-[#0F172A] font-mono mt-0.5 break-all">{targetUrl}</div>
        </div>
        <div className="flex items-center gap-2 bg-[#F8FAFC] px-3.5 py-1.5 rounded-xl border border-[#E2E8F0] self-start">
          <div className="w-2.5 h-2.5 rounded-full bg-[#2563EB] animate-pulse" />
          <span className="text-xs font-semibold text-[#475569]">Playwright & Async Worker</span>
        </div>
      </div>

      {/* Main Progress Indicator */}
      <div className="my-8">
        <div className="flex justify-between items-center mb-2.5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#2563EB] animate-spin" />
            <span className="text-sm font-semibold text-[#0F172A]">{currentStep}</span>
          </div>
          <span className="text-sm font-mono font-bold text-[#2563EB]">{progress}%</span>
        </div>

        {/* Clean Progress Bar */}
        <div className="w-full h-2.5 bg-[#F1F5F9] rounded-full overflow-hidden p-0.5 border border-[#E2E8F0]">
          <div
            className="h-full bg-[#2563EB] rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Grid of scanning modules */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {steps.map((step, idx) => {
          const isDone = progress >= step.doneThreshold;
          const isActive = progress >= step.activeThreshold && !isDone;
          const Icon = step.icon;

          return (
            <div
              key={idx}
              className={`p-3 rounded-2xl border transition-all text-center flex flex-col items-center justify-center gap-2 ${
                isDone
                  ? 'bg-[#DCFCE7]/60 border-[#BBF7D0] text-[#166534]'
                  : isActive
                  ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]'
                  : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#94A3B8]'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                  isDone
                    ? 'bg-[#DCFCE7] text-[#166534]'
                    : isActive
                    ? 'bg-[#DBEAFE] text-[#2563EB]'
                    : 'bg-[#F1F5F9] text-[#94A3B8]'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="text-[11px] font-medium leading-tight">{step.title}</div>
            </div>
          );
        })}
      </div>

      {statusData?.error_message && (
        <div className="mt-6 p-4 rounded-2xl bg-[#FEE2E2] border border-[#FECACA] text-[#991B1B] text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-[#DC2626] mt-0.5" />
          <div>
            <div className="font-semibold">Ошибка во время сканирования</div>
            <div className="text-xs text-[#B91C1C] font-mono mt-1">{statusData.error_message}</div>
          </div>
        </div>
      )}
    </div>
  );
};
