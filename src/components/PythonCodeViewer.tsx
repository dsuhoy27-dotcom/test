import React, { useState, useEffect } from 'react';
import { Code2, Copy, Check, FileCode, Layers, Server, Terminal, Box, Database, Cpu } from 'lucide-react';

interface CodeFile {
  path: string;
  label: string;
  content: string;
}

export const PythonCodeViewer: React.FC = () => {
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('app/services/parser.py');
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/python-codebase')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setFiles(data);
          setSelectedFile(data[0].path);
        }
      })
      .catch((err) => console.error('Failed to load codebase:', err))
      .finally(() => setIsLoading(false));
  }, []);

  const activeFile = files.find((f) => f.path === selectedFile) || files[0];

  const handleCopy = () => {
    if (activeFile) {
      navigator.clipboard.writeText(activeFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Architecture Header */}
      <div className="bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-6 border-b border-[#F1F5F9]">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#2563EB]">
                Production Backend Architecture
              </span>
              <span className="text-xs text-[#CBD5E1]">•</span>
              <span className="text-xs text-[#16A34A] font-semibold">Python 3.10+ & Asyncio</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#0F172A] mt-1">
              Микросервис аудита 152-ФЗ на Python (FastAPI + Celery + Playwright)
            </h2>
            <p className="text-sm text-[#64748B] mt-2 max-w-3xl leading-relaxed">
              Полный комплект production-ready исходного кода backend-микросервиса: асинхронный FastAPI,
              SQLAlchemy 2.0 (asyncpg), очереди задач Celery на Redis, headless-парсинг через Playwright и
              контейнеризация через Docker Compose.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-4 py-2 bg-[#0F172A] hover:bg-slate-800 text-white font-medium text-xs rounded-xl shadow-sm transition-all"
            >
              {copied ? <Check className="w-4 h-4 text-[#4ADE80]" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Код скопирован!' : 'Скопировать текущий файл'}</span>
            </button>
          </div>
        </div>

        {/* Stack badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <div className="p-3 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center shrink-0">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-[#0F172A]">FastAPI + Uvicorn</div>
              <div className="text-[10px] text-[#64748B]">REST API & Rate Limit</div>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center shrink-0">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-[#0F172A]">PostgreSQL + SQLAlchemy 2.0</div>
              <div className="text-[10px] text-[#64748B]">Asyncpg & JSONB Reports</div>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center shrink-0">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-[#0F172A]">Celery + Redis</div>
              <div className="text-[10px] text-[#64748B]">Non-blocking task workers</div>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#FEF3C7] text-[#D97706] flex items-center justify-center shrink-0">
              <Box className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-[#0F172A]">Playwright Headless</div>
              <div className="text-[10px] text-[#64748B]">DOM, Forms, Modals & SSL</div>
            </div>
          </div>
        </div>
      </div>

      {/* Code Browser Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Sidebar File Tree */}
        <div className="lg:col-span-4 bg-white border border-[#E2E8F0] rounded-3xl p-4 space-y-2 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-[#64748B] px-2 py-1 flex items-center justify-between">
            <span>Файлы микросервиса</span>
            <span className="text-[10px] bg-[#F1F5F9] px-2 py-0.5 rounded-full text-[#475569] font-mono">
              {files.length} файлов
            </span>
          </div>

          <div className="space-y-1">
            {files.map((file) => {
              const isSelected = file.path === selectedFile;
              return (
                <button
                  key={file.path}
                  onClick={() => setSelectedFile(file.path)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition-all flex flex-col gap-0.5 ${
                    isSelected
                      ? 'bg-[#0F172A] text-white shadow-sm'
                      : 'text-[#475569] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
                  }`}
                >
                  <div className="flex items-center gap-2 font-mono font-medium">
                    <FileCode className={`w-3.5 h-3.5 ${isSelected ? 'text-sky-400' : 'text-[#94A3B8]'}`} />
                    <span className="truncate">{file.path}</span>
                  </div>
                  <div className={`text-[10px] font-sans pl-5 truncate ${isSelected ? 'text-slate-300' : 'text-[#94A3B8]'}`}>
                    {file.label}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quick command */}
          <div className="pt-4 mt-4 border-t border-[#F1F5F9] p-2">
            <div className="text-[11px] font-semibold text-[#64748B] mb-1 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Запуск через Docker:</span>
            </div>
            <div className="bg-[#F8FAFC] p-2.5 rounded-xl font-mono text-[11px] text-[#0F172A] border border-[#E2E8F0]">
              docker-compose up -d --build
            </div>
          </div>
        </div>

        {/* Code Content Viewer */}
        <div className="lg:col-span-8 bg-[#0F172A] border border-[#E2E8F0] rounded-3xl shadow-sm overflow-hidden text-slate-200">
          {/* File Header */}
          <div className="bg-slate-900 px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
              <Code2 className="w-4 h-4 text-sky-400" />
              <span className="font-bold text-white">{activeFile?.path}</span>
              <span className="text-slate-400 hidden sm:inline">— {activeFile?.label}</span>
            </div>

            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 transition-all"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#4ADE80]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Скопировано' : 'Копировать'}</span>
            </button>
          </div>

          {/* Code Body */}
          <div className="p-5 bg-[#0F172A] overflow-x-auto max-h-[700px] overflow-y-auto">
            <pre className="font-mono text-xs text-slate-200 leading-relaxed">
              <code>{activeFile?.content}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
