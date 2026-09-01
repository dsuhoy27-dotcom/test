import React from 'react';
import { ShieldCheck, Code2, Sparkles, FileText } from 'lucide-react';

interface HeaderProps {
  activeTab: 'scanner' | 'python_code' | 'law_guide';
  setActiveTab: (tab: 'scanner' | 'python_code' | 'law_guide') => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab }) => {
  return (
    <header className="border-b border-[#E2E8F0] bg-white sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#2563EB] flex items-center justify-center shadow-sm">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-[#0F172A] tracking-tight">FZ152.AUDIT</span>
              <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#166534] border border-[#BBF7D0]">
                v1.0 SaaS
              </span>
            </div>
            <p className="text-xs text-[#64748B] hidden sm:block">
              Автоматический аудит сайтов на соответствие 152-ФЗ и КоАП РФ
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center bg-[#F1F5F9] p-1 rounded-xl border border-[#E2E8F0]">
          <button
            id="tab-scanner-btn"
            onClick={() => setActiveTab('scanner')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
              activeTab === 'scanner'
                ? 'bg-[#0F172A] text-white shadow-sm'
                : 'text-[#64748B] hover:text-[#0F172A] hover:bg-white/60'
            }`}
          >
            <Sparkles className="w-4 h-4 text-sky-400" />
            <span>Сканер сайтов</span>
          </button>

          <button
            id="tab-python-code-btn"
            onClick={() => setActiveTab('python_code')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
              activeTab === 'python_code'
                ? 'bg-[#0F172A] text-white shadow-sm'
                : 'text-[#64748B] hover:text-[#0F172A] hover:bg-white/60'
            }`}
          >
            <Code2 className="w-4 h-4 text-indigo-400" />
            <span>Python Backend</span>
          </button>

          <button
            id="tab-law-guide-btn"
            onClick={() => setActiveTab('law_guide')}
            className={`hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
              activeTab === 'law_guide'
                ? 'bg-[#0F172A] text-white shadow-sm'
                : 'text-[#64748B] hover:text-[#0F172A] hover:bg-white/60'
            }`}
          >
            <FileText className="w-4 h-4 text-amber-500" />
            <span>Штрафы КоАП 13.11</span>
          </button>
        </div>
      </div>
    </header>
  );
};
